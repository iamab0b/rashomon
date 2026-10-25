import { describe, expect, test } from "vitest";
import storeJson from "../fixtures/store.scene.json";
import robberyJson from "../fixtures/robbery.graph.json";
import { ACTIONS, ACTION_STYLES, MAX_VERB_CHARS, STYLE_ACTION } from "./index";
import type { Anchor, Event, EventGraph, SceneManifest } from "./index";
import { robberyGraph, robberyResolved, storeScene } from "./fixtures";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isVec3 = (v: unknown): boolean =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number");

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === "string");

const isManifest = (v: unknown): v is SceneManifest =>
  isRecord(v) &&
  typeof v.sceneId === "string" &&
  typeof v.meshUrl === "string" &&
  v.up === "y" &&
  v.unitsPerMeter === 1 &&
  v.eyeHeight === 1.6 &&
  Array.isArray(v.landmarks) &&
  v.landmarks.every(
    (l) =>
      isRecord(l) &&
      typeof l.id === "string" &&
      typeof l.label === "string" &&
      isStringArray(l.aliases) &&
      isVec3(l.position) &&
      isRecord(l.bounds) &&
      isVec3(l.bounds.min) &&
      isVec3(l.bounds.max) &&
      typeof l.kind === "string" &&
      typeof l.occludes === "boolean",
  );

const isAnchor = (v: unknown): v is Anchor => {
  if (!isRecord(v)) return false;
  if (v.kind === "at") return typeof v.landmark === "string";
  if (v.kind === "near") return typeof v.landmark === "string";
  if (v.kind === "behind") return typeof v.landmark === "string";
  if (v.kind === "between")
    return typeof v.a === "string" && typeof v.b === "string";
  if (v.kind === "xyz") return isVec3(v.position);
  return false;
};

const isEvent = (v: unknown): v is Event =>
  isRecord(v) &&
  typeof v.id === "string" &&
  typeof v.witnessId === "string" &&
  typeof v.actor === "string" &&
  ACTIONS.includes(v.action as never) &&
  Array.isArray(v.t) &&
  v.t.length === 2 &&
  v.t.every((n) => typeof n === "number") &&
  (v.tConfidence === "stated" || v.tConfidence === "inferred") &&
  typeof v.confidence === "number" &&
  isStringArray(v.sources) &&
  typeof v.status === "string" &&
  Array.isArray(v.flags) &&
  (["from", "to", "at"] as const).every(
    (k) => v[k] === undefined || isAnchor(v[k]),
  );

const isGraph = (v: unknown): v is EventGraph =>
  isRecord(v) &&
  typeof v.sceneId === "string" &&
  typeof v.version === "number" &&
  Array.isArray(v.actors) &&
  Array.isArray(v.events) &&
  v.events.every(isEvent) &&
  Array.isArray(v.props) &&
  v.props.every(
    (p) =>
      isRecord(p) &&
      typeof p.id === "string" &&
      typeof p.type === "string" &&
      isAnchor(p.anchor) &&
      typeof p.notes === "string" &&
      isStringArray(p.sources),
  );

const anchorLandmarks = (a: Anchor): string[] => {
  if (a.kind === "at" || a.kind === "near" || a.kind === "behind")
    return [a.landmark];
  if (a.kind === "between") return [a.a, a.b];
  return [];
};

describe("fixtures", () => {
  const store: unknown = storeJson;
  const robbery: unknown = robberyJson;

  test("store fixture parses as a SceneManifest with 11 landmarks", () => {
    expect(isManifest(store)).toBe(true);
    if (!isManifest(store)) return;
    expect(store.landmarks).toHaveLength(11);
  });

  test("robbery fixture parses as an EventGraph with 3 actors, 10 events, 2 props", () => {
    expect(isGraph(robbery)).toBe(true);
    if (!isGraph(robbery)) return;
    expect(robbery.actors).toHaveLength(3);
    expect(robbery.events).toHaveLength(10);
    expect(robbery.props).toHaveLength(2);
  });

  test("every event has at least one source", () => {
    if (!isGraph(robbery)) throw new Error("robbery fixture invalid");
    for (const e of robbery.events) expect(e.sources.length).toBeGreaterThan(0);
  });

  test("every anchor references a landmark that exists in the store", () => {
    if (!isGraph(robbery) || !isManifest(store))
      throw new Error("fixtures invalid");
    const ids = new Set(store.landmarks.map((l) => l.id));
    const anchors: Anchor[] = [
      ...robbery.events.flatMap((e) =>
        [e.from, e.to, e.at].filter((a): a is Anchor => a !== undefined),
      ),
      ...robbery.props.map((p) => p.anchor),
    ];
    for (const a of anchors)
      for (const id of anchorLandmarks(a)) expect(ids.has(id)).toBe(true);
  });

  test("every confidence is one of the extractor's three values", () => {
    const allowed = [0.3, 0.6, 0.9];
    const patches = (robberyJson as { correctionPatch: { patches: { event?: { confidence: number } }[] } })
      .correctionPatch.patches.flatMap((p) => (p.event ? [p.event] : []));
    for (const e of [...robberyGraph.events, ...patches])
      expect(allowed).toContain(e.confidence);
  });

  test("the fixtures entry point exposes the store with its interior", () => {
    expect(storeScene.sceneId).toBe("store_v1");
    expect(storeScene.interior).toEqual({ min: [0, 0, 0], max: [9, 3, 7] });
    expect(robberyGraph.events).toHaveLength(10);
    expect(robberyResolved.sceneId).toBe("store_v1");
    expect(robberyResolved.events.map((e) => e.id)).toEqual(robberyGraph.events.map((e) => e.id));
  });
});

describe("action vocabulary", () => {
  test("the nine new actions are appended after the original thirteen", () => {
    expect(ACTIONS).toHaveLength(22);
    expect(ACTIONS.slice(13)).toEqual([
      "hands_up",
      "point",
      "reach",
      "kneel",
      "stumble",
      "jump",
      "phone",
      "drink",
      "dodge",
    ]);
  });

  test("each style belongs to exactly one existing action", () => {
    expect(Object.keys(STYLE_ACTION).sort()).toEqual([...ACTION_STYLES].sort());
    expect(STYLE_ACTION).toEqual({
      sneak: "walk",
      scared: "run",
      forward: "fall",
      outward: "open_door",
      behind: "look",
    });
    for (const a of Object.values(STYLE_ACTION)) expect(ACTIONS).toContain(a);
    expect(MAX_VERB_CHARS).toBe(40);
  });
});
