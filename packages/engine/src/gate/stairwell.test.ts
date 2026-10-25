import { describe, expect, test } from "vitest";
import type { Anchor, Event, EventGraph, SceneManifest } from "@rashomon/schema";
import roomJson from "../../../schema/fixtures/room.scene.json";
import stairwellJson from "../../../schema/fixtures/stairwell.graph.json";
import { gate } from "./index";
import { resolve } from "../resolve/resolve";

const room = roomJson as unknown as SceneManifest;
const stairwell = stairwellJson as unknown as EventGraph;
const NO_MESHES = { meshes: [] };

type PatchJson = {
  op: string;
  id?: string;
  changes?: Partial<Event>;
  event?: Omit<Event, "id" | "status" | "flags">;
};

function applyCorrection(graph: EventGraph, patches: PatchJson[]): EventGraph {
  let events = graph.events;
  for (const p of patches) {
    if (p.op === "update_event" && p.id && p.changes) {
      const { id, changes } = p;
      events = events.map((e) => (e.id === id ? { ...e, ...changes } : e));
    } else if (p.op === "add_event" && p.event) {
      events = [...events, { ...p.event, id: `e${events.length + 1}`, status: "proposed", flags: [] }];
    } else {
      throw new Error(`unsupported patch ${p.op}`);
    }
  }
  return { ...graph, events };
}

const corrected = applyCorrection(stairwell, stairwellJson.correctionPatch.patches as PatchJson[]);

function anchorLandmarks(anchor: Anchor | undefined): string[] {
  if (!anchor || anchor.kind === "xyz") return [];
  return anchor.kind === "between" ? [anchor.a, anchor.b] : [anchor.landmark];
}

function referencedLandmarks(graph: EventGraph): string[] {
  return graph.events.flatMap((e) => [
    ...anchorLandmarks(e.from),
    ...anchorLandmarks(e.to),
    ...anchorLandmarks(e.at),
    ...(e.facing ? [e.facing] : []),
  ]);
}

describe("the stairwell fixture on room_v1", () => {
  test("every stairwell anchor resolves in room_v1", () => {
    const ids = new Set(room.landmarks.map((l) => l.id));
    const missing = [...new Set([...referencedLandmarks(stairwell), ...referencedLandmarks(corrected)])].filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
  });

  test("room_v1 has no hand-written portals, so the walkable graph is generated", () => {
    expect(room.portals).toBeUndefined();
  });

  test("before the correction, w2e is implausible with a hard sightline flag naming the ladder", () => {
    const out = gate(resolve(stairwell, room), room, NO_MESHES);
    expect(out.statuses.w2e).toBe("implausible");
    const flag = out.flags.find((f) => f.eventId === "w2e" && f.check === "sightline");
    expect(flag?.severity).toBe("hard");
    expect(flag?.detail).toContain("ladder");
    for (const e of stairwell.events) if (e.id !== "w2e") expect(out.statuses[e.id], e.id).toBe("plausible");
    expect(out.flags.filter((f) => f.eventId !== "w2e")).toEqual([]);
  });

  test("after the correction, w2e and the new walk are plausible and nothing is contradicted", () => {
    const out = gate(resolve(corrected, room), room, NO_MESHES);
    const walk = corrected.events.find((e) => e.actor === "witness" && e.action === "walk");
    expect(walk).toBeDefined();
    expect(out.statuses.w2e).toBe("plausible");
    expect(out.statuses[walk!.id]).toBe("plausible");
    expect(Object.values(out.statuses).every((status) => status === "plausible")).toBe(true);
    expect(out.flags.filter((f) => f.check === "contradiction")).toEqual([]);
    expect(out.flags).toEqual([]);
  });

  test("every walk is reachable through the generated portals and within walking speed", () => {
    for (const graph of [stairwell, corrected]) {
      const resolved = resolve(graph, room);
      const walks = resolved.events.filter((e) => e.action === "walk");
      expect(walks.length).toBeGreaterThan(0);
      for (const e of walks) {
        expect(e.reachable, e.id).toBe(true);
        expect(e.pathLengthM, e.id).toBeGreaterThan(0);
        expect(e.pathLengthM / (e.tEnd - e.tStart), e.id).toBeLessThan(2);
      }
    }
  });

  test("the correction's walk from the stairs to the west window is about 2.9 m", () => {
    const resolved = resolve(corrected, room);
    const walk = resolved.events.find((e) => e.actor === "witness" && e.action === "walk");
    expect(walk?.pathLengthM).toBeGreaterThan(2.5);
    expect(walk?.pathLengthM).toBeLessThan(3.5);
  });
});
