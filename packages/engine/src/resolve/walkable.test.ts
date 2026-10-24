import { describe, expect, test } from "vitest";
import type { Event, EventGraph, Landmark, SceneManifest } from "@rashomon/schema";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { reachabilityFlags } from "../gate/reachability";
import { gate, generatePortals } from "../index";
import { expand, segmentHitsBox, type Point2 } from "./geometry";
import { shortestPath } from "./portals";
import { resolve } from "./resolve";

const withoutPortals = (manifest: SceneManifest): SceneManifest => {
  const { portals: _portals, ...rest } = manifest;
  return rest;
};

const landmark = (
  id: string,
  kind: Landmark["kind"],
  min: [number, number],
  max: [number, number],
  occludes = kind === "furniture" || kind === "appliance",
): Landmark => ({
  id,
  label: id,
  aliases: [],
  position: [(min[0] + max[0]) / 2, 0, (min[1] + max[1]) / 2],
  bounds: { min: [min[0], 0, min[1]], max: [max[0], 1, max[1]] },
  kind,
  occludes,
});

const zone = (id: string, x: number, z: number): Landmark => ({
  id,
  label: id,
  aliases: [],
  position: [x, 0, z],
  bounds: { min: [x - 0.2, 0, z - 0.2], max: [x + 0.2, 2, z + 0.2] },
  kind: "zone",
  occludes: false,
});

const manifestOf = (landmarks: Landmark[], max: [number, number]): SceneManifest => ({
  sceneId: "t",
  meshUrl: "",
  up: "y",
  unitsPerMeter: 1,
  eyeHeight: 1.6,
  landmarks,
  interior: { min: [0, 0, 0], max: [max[0], 3, max[1]] },
});

const walk = (id: string, from: string, to: string): Event => ({
  id,
  witnessId: "w1",
  actor: "a",
  action: "walk",
  from: { kind: "at", landmark: from },
  to: { kind: "at", landmark: to },
  t: [0, 10],
  tConfidence: "stated",
  confidence: 0.9,
  sources: [`utt_${id}`],
  status: "proposed",
  flags: [],
});

const graphOf = (events: Event[]): EventGraph => ({
  sceneId: "t",
  actors: [{ id: "a", label: "A", role: "suspect", rig: "mixamo_ybot" }],
  events,
  props: [],
  version: 1,
});

describe("generatePortals", () => {
  test("is deterministic: the same manifest gives the same graph, byte for byte", () => {
    const bare = withoutPortals(storeScene);
    const first = JSON.stringify(generatePortals(bare));
    const second = JSON.stringify(generatePortals(withoutPortals(storeScene)));
    expect(second).toBe(first);
    const portals = generatePortals(bare);
    expect(portals.waypoints.map((w) => w.id)).toEqual(portals.waypoints.map((_, i) => `w${i}`));
    expect(portals.edges.length).toBeGreaterThan(0);
  });

  test("no waypoint lies inside a furniture or appliance box grown by the routing margin", () => {
    const portals = generatePortals(withoutPortals(storeScene));
    const boxes = storeScene.landmarks
      .filter((l) => l.kind === "furniture" || l.kind === "appliance")
      .map((l) => expand(l.bounds, 0.3));
    for (const w of portals.waypoints) {
      for (const box of boxes) {
        const inside = w.x > box.min[0] && w.x < box.max[0] && w.z > box.min[2] && w.z < box.max[2];
        expect(inside, `${w.id} at (${w.x}, ${w.z})`).toBe(false);
      }
    }
  });
});

describe("the robbery on the store with its portals removed", () => {
  const bare = withoutPortals(storeScene);
  const authored = resolve(robberyGraph, storeScene);
  const generated = resolve(robberyGraph, bare);
  const moves = authored.events.filter((e) => e.action === "walk" || e.action === "run");

  test("every movement event is reachable, passes the reachability check, and is within 10% of the hand-authored length", () => {
    expect(moves.map((e) => e.id)).toEqual(["e1", "e10"]);
    expect(reachabilityFlags(generated, bare)).toEqual([]);
    for (const a of moves) {
      const g = generated.events.find((e) => e.id === a.id)!;
      expect(g.reachable, a.id).toBe(true);
      expect(g.path.length, a.id).toBeGreaterThanOrEqual(2);
      expect(Math.abs(g.pathLengthM - a.pathLengthM) / a.pathLengthM, a.id).toBeLessThanOrEqual(0.1);
    }
  });

  test("e1 still rounds shelf_b: it turns past the shelf's south-east corner and never crosses the shelf", () => {
    const e1 = generated.events.find((e) => e.id === "e1")!;
    const shelf = storeScene.landmarks.find((l) => l.id === "shelf_b")!.bounds;
    const corners = e1.path.slice(1, -1);
    expect(corners.some((p) => p[0] > shelf.max[0] && p[2] < shelf.min[2])).toBe(true);
    for (let i = 1; i < e1.path.length; i++) {
      const a: Point2 = { x: e1.path[i - 1]![0], z: e1.path[i - 1]![2] };
      const b: Point2 = { x: e1.path[i]![0], z: e1.path[i]![2] };
      expect(segmentHitsBox(a, b, shelf)).toBe(false);
    }
  });

  test("the gate gives the same statuses with generated portals as with the hand-authored ones", () => {
    const geom = { meshes: [] };
    expect(gate(generated, bare, geom).statuses).toEqual(gate(authored, storeScene, geom).statuses);
  });

  test("the store fixture with its portals still resolves from its hand-authored graph", () => {
    const e1 = authored.events.find((e) => e.id === "e1")!;
    expect(e1.path).toEqual([
      [1.5, 0, 0.4],
      [6.4, 0, 1.6],
      [7.2, 0, 2.5],
    ]);
  });
});

describe("routing on generated portals", () => {
  test("a wall of furniture with one gap routes through the gap", () => {
    const manifest = manifestOf(
      [
        landmark("wall_south", "furniture", [4.5, 0], [5.5, 4.2]),
        landmark("wall_north", "furniture", [4.5, 5.8], [5.5, 7]),
        zone("west", 2, 1),
        zone("east", 8, 1),
      ],
      [10, 7],
    );
    const resolved = resolve(graphOf([walk("m", "west", "east")]), manifest);
    const m = resolved.events[0]!;
    expect(m.reachable).toBe(true);
    const crossings: number[] = [];
    for (let i = 1; i < m.path.length; i++) {
      const [ax, , az] = m.path[i - 1]!;
      const [bx, , bz] = m.path[i]!;
      if ((ax - 5) * (bx - 5) <= 0 && ax !== bx) crossings.push(az + ((5 - ax) / (bx - ax)) * (bz - az));
    }
    expect(crossings).toHaveLength(1);
    expect(crossings[0]).toBeGreaterThan(4.2);
    expect(crossings[0]).toBeLessThan(5.8);
    for (let i = 1; i < m.path.length; i++) {
      const a: Point2 = { x: m.path[i - 1]![0], z: m.path[i - 1]![2] };
      const b: Point2 = { x: m.path[i]![0], z: m.path[i]![2] };
      for (const wall of manifest.landmarks.slice(0, 2)) expect(segmentHitsBox(a, b, wall.bounds)).toBe(false);
    }
    expect(m.pathLengthM).toBeGreaterThan(6);
  });

  test("a fully blocked target is unreachable exactly as the resolver reports it without portals today", () => {
    const ring = [
      landmark("ring_s", "furniture", [6, 2], [9, 2.5]),
      landmark("ring_n", "furniture", [6, 5.5], [9, 6]),
      landmark("ring_w", "furniture", [6, 2], [6.5, 6]),
      landmark("ring_e", "furniture", [8.5, 2], [9, 6]),
      zone("start", 2, 4),
      zone("trapped", 7.5, 4),
    ];
    const manifest = manifestOf(ring, [10, 8]);
    const graph = graphOf([walk("m", "start", "trapped")]);
    const generated = resolve(graph, manifest);
    const today = resolve(graph, { ...manifest, portals: { waypoints: [], edges: [] } });
    const m = generated.events[0]!;
    expect(m.reachable).toBe(false);
    expect(m.path).toEqual([]);
    expect(m).toEqual(today.events[0]);
    expect(reachabilityFlags(generated, manifest)).toEqual(reachabilityFlags(today, manifest));
    expect(reachabilityFlags(generated, manifest)).toHaveLength(1);
    const portals = generatePortals(manifest);
    const from = generated.events[0]!.from!;
    const to = generated.events[0]!.to!;
    const obstacles = ring.filter((l) => l.occludes).map((l) => l.bounds);
    expect(shortestPath(from, to, portals, obstacles)).toBeNull();
  });

  test("a manifest with no landmarks and no interior gives an empty graph", () => {
    const { interior: _i, ...noInterior } = manifestOf([], [5, 5]);
    expect(generatePortals(noInterior as SceneManifest)).toEqual({ waypoints: [], edges: [] });
  });
});

describe("performance", () => {
  test("a 20 x 20 m interior with 30 landmarks is generated in under 200 ms", () => {
    const landmarks: Landmark[] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        const x = 2 + col * 3.6;
        const z = 3 + row * 6;
        landmarks.push(landmark(`shelf_${row}_${col}`, row === 1 && col % 2 === 0 ? "appliance" : "furniture", [x, z], [x + 1.2, z + 3]));
      }
    }
    for (let i = 0; i < 15; i++) landmarks.push(zone(`spot_${i}`, 0.8 + ((i * 7) % 19), 0.8 + ((i * 11) % 19)));
    const manifest = manifestOf(landmarks, [20, 20]);
    generatePortals(manifest);
    const start = performance.now();
    const portals = generatePortals(manifest);
    const elapsed = performance.now() - start;
    process.stdout.write(`generatePortals 20x20 m, 30 landmarks: ${elapsed.toFixed(1)} ms, ${portals.waypoints.length} waypoints, ${portals.edges.length} edges\n`);
    expect(landmarks).toHaveLength(30);
    expect(portals.waypoints.length).toBeGreaterThan(15);
    expect(elapsed).toBeLessThan(200);
  });
});

describe("routes the landmark pairs alone would miss", () => {
  test("a walk from one side of a lone shelf to the other goes around it", () => {
    const manifest = manifestOf([landmark("shelf", "furniture", [4, 3], [6, 7])], [10, 10]);
    const graph = graphOf([
      {
        ...walk("m", "shelf", "shelf"),
        from: { kind: "near", landmark: "shelf", radiusM: 0.6 },
        to: { kind: "behind", landmark: "shelf" },
      },
    ]);
    const m = resolve(graph, manifest).events[0]!;
    expect(m.from).toBeDefined();
    expect(m.to).toBeDefined();
    expect(m.reachable).toBe(true);
    const shelf = manifest.landmarks[0]!.bounds;
    for (let i = 1; i < m.path.length; i++) {
      const a: Point2 = { x: m.path[i - 1]![0], z: m.path[i - 1]![2] };
      const b: Point2 = { x: m.path[i]![0], z: m.path[i]![2] };
      expect(segmentHitsBox(a, b, shelf)).toBe(false);
    }
  });

  test("a free strip at the upper edge of the room is not lost to the grid rounding", () => {
    const manifest = manifestOf(
      [landmark("wall", "furniture", [4.5, 0], [5.5, 6.5]), zone("west", 2, 1), zone("east", 8, 1)],
      [10, 7.2],
    );
    const m = resolve(graphOf([walk("m", "west", "east")]), manifest).events[0]!;
    expect(m.reachable).toBe(true);
    expect(Math.max(...m.path.map((p) => p[2]))).toBeGreaterThan(6.5);
  });

  test("the grid covers a partial last row and column, so a landmark there gets its access point there", () => {
    const manifest = manifestOf([zone("corner", 9.9, 7.15), zone("start", 1, 1)], [10, 7.2]);
    const portals = generatePortals(manifest, { cellM: 0.25 });
    expect(portals.waypoints[0]).toMatchObject({ x: 9.875, z: 7.125 });
    const odd = manifestOf([zone("corner", 9.95, 7.15), zone("start", 1, 1)], [10.1, 7.2]);
    expect(generatePortals(odd).waypoints[0]).toMatchObject({ x: 9.875, z: 7.125 });
  });
});
