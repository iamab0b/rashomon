import { describe, expect, test } from "vitest";
import { robberyResolved, storeScene } from "@rashomon/schema/fixtures";
import type { ResolvedGraph } from "@rashomon/engine";
import { holderDrawn } from "./holder";
import { propPose } from "./propPose";
import { restBaseY } from "./restHeight";

const resolved = robberyResolved as unknown as ResolvedGraph;
const knife = resolved.props.find((p) => p.id === "p_knife")!;
const register = resolved.props.find((p) => p.id === "p_register")!;

describe("propPose", () => {
  test("the knife rests at its resolved position before and after the hold", () => {
    expect(propPose(knife, 10)).toEqual({ kind: "rest", position: [7.3, 0, 2.5] });
    expect(propPose(knife, 24)).toEqual({ kind: "rest", position: [7.3, 0, 2.5] });
    expect(propPose(knife, 0)).toEqual({ kind: "rest", position: [7.3, 0, 2.5] });
  });

  test("the knife is held by the suspect from tStart inclusive to tEnd exclusive", () => {
    expect(propPose(knife, 11)).toEqual({ kind: "held", actor: "suspect" });
    expect(propPose(knife, 12)).toEqual({ kind: "held", actor: "suspect" });
    expect(propPose(knife, 23.9)).toEqual({ kind: "held", actor: "suspect" });
  });

  test("a prop with no intervals always rests, and the pose depends only on t", () => {
    expect(propPose(register, 15)).toEqual({ kind: "rest", position: [8.1, 0, 1.8] });
    const forward = [5, 11, 15, 24].map((t) => propPose(knife, t).kind);
    const backward = [24, 15, 11, 5].map((t) => propPose(knife, t).kind).reverse();
    expect(backward).toEqual(forward);
  });
});

describe("restBaseY", () => {
  test("a prop near the counter sits on the counter top from the manifest", () => {
    const counter = storeScene.landmarks.find((l) => l.id === "counter")!;
    expect(restBaseY({ kind: "near", landmark: "counter", radiusM: 0.5 }, storeScene, 0)).toBe(counter.bounds.max[1]);
  });

  test("a prop at a prop_spawn landmark sits on that landmark's base", () => {
    const spawn = storeScene.landmarks.find((l) => l.id === "register")!;
    expect(restBaseY({ kind: "at", landmark: "register" }, storeScene, 0)).toBe(spawn.bounds.min[1]);
  });

  test("no anchor, an xyz anchor or an unknown landmark falls back to the resolved y", () => {
    expect(restBaseY(undefined, storeScene, 0.2)).toBe(0.2);
    expect(restBaseY({ kind: "xyz", position: [1, 2, 3] }, storeScene, 0.2)).toBe(0.2);
    expect(restBaseY({ kind: "at", landmark: "nowhere" }, storeScene, 0.2)).toBe(0.2);
  });
});

describe("holderDrawn", () => {
  const events = resolved.events;
  test("a plausible holder is drawn, an implausible or superseded one is not", () => {
    const plausible = () => "plausible" as const;
    expect(holderDrawn(resolved, plausible, "suspect", 12)).toBe(true);
    expect(holderDrawn(resolved, () => "implausible", "suspect", 12)).toBe(false);
    expect(holderDrawn(resolved, () => "superseded", "suspect", 12)).toBe(false);
    const current = events.filter((e) => e.actor === "suspect" && e.tStart <= 12).sort((a, b) => b.tStart - a.tStart)[0]!;
    expect(holderDrawn(resolved, (e) => (e.id === current.id ? "superseded" : "plausible"), "suspect", 12)).toBe(false);
    expect(holderDrawn(resolved, (e) => (e.id === current.id ? "superseded" : "plausible"), "suspect", 0)).toBe(true);
  });
});
