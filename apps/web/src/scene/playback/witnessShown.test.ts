import type { ResolvedEvent, ResolvedGraph } from "@rashomon/engine";
import { MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";
import { applyRayOpacity } from "../cameras/PovRayLine";
import { actorPosition, buildActorPlayback, ghostAnchor, positionEvent } from "./actorPose";
import { applyGhostOpacity } from "./Ghost";
import { fixtureGraphSource } from "./graphSource";
import { statusOf } from "./useGraph";
import { HIDDEN_WITNESS_OPACITY, disagreementEvents, eventWitnessHidden, markerShown, rigOpacity } from "./witnessLayers";

const COUNTER: [number, number, number] = [7.2, 0, 2.5];
const COOLER: [number, number, number] = [4.5, 0, 5.8];
const NONE: ReadonlySet<string> = new Set();
const only = (id: string): ReadonlySet<string> => new Set([id]);

function twoWitnesses() {
  const snapshot = fixtureGraphSource("store", "two-witnesses")!.getSnapshot();
  const resolved = snapshot.resolved!;
  const lookup = (event: ResolvedEvent) => statusOf(snapshot.statuses, event);
  const playback = buildActorPlayback(resolved, "suspect", lookup);
  const candidates = disagreementEvents(resolved, lookup);
  const markersAt = (t: number) => candidates.filter((event) => markerShown(playback, event, t));
  return { resolved, playback, markersAt };
}

describe("the event that supplies the rig's position", () => {
  it("is the one actorPosition draws from, and the drawn positions are unchanged", () => {
    const { playback } = twoWitnesses();
    expect(actorPosition(playback, 5)).toEqual(COUNTER);
    expect(actorPosition(playback, 10.5)).toEqual(COOLER);
    expect(actorPosition(playback, 12.5)).toEqual(COUNTER);
    expect(actorPosition(playback, 14)).toEqual(COOLER);
    expect(positionEvent(playback, 5)?.id).toBe("e1");
    expect(positionEvent(playback, 7)?.id).toBe("e4");
    expect(positionEvent(playback, 10.5)?.id).toBe("e11");
    expect(positionEvent(playback, 12.5)?.id).toBe("e7");
    expect(positionEvent(playback, 14)?.id).toBe("e11");
    for (const t of [0, 3, 9.5, 10.5, 11, 12.5, 14, 21, 30]) {
      const event = positionEvent(playback, t);
      if (event?.at) expect(actorPosition(playback, t)).toEqual(event.at);
    }
  });
});

describe("second-witness markers on the two-witnesses fixture", () => {
  it("at t 12.5 the rig shows the customer's e7 at the counter and the marker is the clerk's e11 at the cooler", () => {
    const { markersAt } = twoWitnesses();
    const shown = markersAt(12.5);
    expect(shown.map((e) => e.id)).toEqual(["e11"]);
    expect(ghostAnchor(shown[0]!)).toEqual(COOLER);
  });

  it("at t 10.5 the hold rule shows the clerk's e11, so the marker is the customer's e6 and never the shown event", () => {
    const { markersAt, playback } = twoWitnesses();
    const shown = markersAt(10.5);
    expect(shown.map((e) => e.id)).toEqual(["e6"]);
    expect(ghostAnchor(shown[0]!)).toEqual(COUNTER);
    expect(shown.map((e) => e.id)).not.toContain(positionEvent(playback, 10.5)?.id);
  });

  it("at t 14 the rig shows e11 after e7 has ended, and no marker is drawn", () => {
    expect(twoWitnesses().markersAt(14)).toEqual([]);
  });
});

describe("rig opacity follows the witness whose account the rig shows", () => {
  it("at t 12.5 hiding the clerk leaves the rig at 1 and hiding the customer dims it", () => {
    const { playback } = twoWitnesses();
    expect(rigOpacity(playback, 12.5, 1, only("w2"))).toBe(1);
    expect(rigOpacity(playback, 12.5, 1, only("w1"))).toBe(HIDDEN_WITNESS_OPACITY);
  });

  it("at t 10.5 and t 14 the rig shows the clerk's account, so hiding the clerk dims it and hiding the customer does not", () => {
    const { playback } = twoWitnesses();
    for (const t of [10.5, 14]) {
      expect(rigOpacity(playback, t, 1, only("w2"))).toBe(HIDDEN_WITNESS_OPACITY);
      expect(rigOpacity(playback, t, 1, only("w1"))).toBe(1);
    }
  });

  it("nothing hidden keeps the base opacity, including the proposed 40%", () => {
    const { playback } = twoWitnesses();
    expect(rigOpacity(playback, 12.5, 1, NONE)).toBe(1);
    expect(rigOpacity(playback, 12.5, 0.4, NONE)).toBe(0.4);
  });
});

describe("Greptile's case: a w1 walk over [0, 10] and a w2 stand over [2, 8], at t 5", () => {
  const event = (over: Partial<ResolvedEvent> & { id: string }): ResolvedEvent => ({
    witnessId: "w1",
    actor: "s",
    action: "stand",
    tStart: 0,
    tEnd: 1,
    status: "plausible",
    flags: [],
    path: [],
    pathLengthM: 0,
    reachable: true,
    sources: [`utt_${over.id}`],
    tInferred: false,
    ...over,
  });
  const graph: ResolvedGraph = {
    sceneId: "t",
    version: 1,
    durationS: 10,
    actors: [{ id: "s", label: "Suspect", role: "suspect", rig: "mixamo_ybot" }],
    events: [
      event({ id: "walk", witnessId: "w1", action: "walk", tStart: 0, tEnd: 10, from: [0, 0, 0], to: [8, 0, 0], path: [[0, 0, 0], [8, 0, 0]], pathLengthM: 8 }),
      event({ id: "stand", witnessId: "w2", tStart: 2, tEnd: 8, at: [2, 0, 6] }),
    ],
    props: [],
  };
  const playback = buildActorPlayback(graph, "s", (e) => e.status);
  const candidates = disagreementEvents(graph, (e) => e.status);

  it("the rig is on the w1 walk, the marker is the w2 stand at its anchor, and hiding w2 never dims the rig", () => {
    expect(positionEvent(playback, 5)?.id).toBe("walk");
    expect(actorPosition(playback, 5)?.[0]).toBeCloseTo(4, 6);
    const shown = candidates.filter((e) => markerShown(playback, e, 5));
    expect(shown.map((e) => e.id)).toEqual(["stand"]);
    expect(ghostAnchor(shown[0]!)).toEqual([2, 0, 6]);
    expect(rigOpacity(playback, 5, 1, only("w2"))).toBe(1);
    expect(rigOpacity(playback, 5, 1, only("w1"))).toBe(HIDDEN_WITNESS_OPACITY);
  });
});

describe("red markers dim with their witness", () => {
  it("with w1 hidden, e5's ghost badge and its blocked ray's hit sphere take the dimmed opacity", () => {
    const resolved = fixtureGraphSource("store")!.getSnapshot().resolved!;
    const e5 = resolved.events.find((e) => e.id === "e5")!;
    const body = new MeshBasicMaterial({ transparent: true, opacity: 0.6 });
    const badge = new MeshBasicMaterial();
    applyGhostOpacity(only("w1"), e5, body, badge);
    expect(badge.opacity).toBe(HIDDEN_WITNESS_OPACITY);
    expect(badge.transparent).toBe(true);
    expect(body.opacity).toBe(HIDDEN_WITNESS_OPACITY);

    const beam = new MeshBasicMaterial();
    const hit = new MeshBasicMaterial();
    applyRayOpacity(eventWitnessHidden(resolved, only("w1"), "e5"), beam, hit);
    expect(hit.opacity).toBe(HIDDEN_WITNESS_OPACITY);
    expect(hit.transparent).toBe(true);
    expect(beam.opacity).toBe(HIDDEN_WITNESS_OPACITY);
  });

  it("with nothing hidden the single-witness materials are as before: badge, beam and hit opaque and not transparent", () => {
    const resolved = fixtureGraphSource("store")!.getSnapshot().resolved!;
    const e5 = resolved.events.find((e) => e.id === "e5")!;
    const body = new MeshBasicMaterial({ transparent: true, opacity: 0.6 });
    const badge = new MeshBasicMaterial();
    applyGhostOpacity(NONE, e5, body, badge);
    expect([body.opacity, body.transparent]).toEqual([0.6, true]);
    expect([badge.opacity, badge.transparent]).toEqual([1, false]);

    const beam = new MeshBasicMaterial();
    const hit = new MeshBasicMaterial();
    applyRayOpacity(eventWitnessHidden(resolved, NONE, "e5"), beam, hit);
    expect([beam.opacity, beam.transparent]).toEqual([1, false]);
    expect([hit.opacity, hit.transparent]).toEqual([1, false]);
    expect(eventWitnessHidden(resolved, only("w2"), "e5")).toBe(false);
    expect(eventWitnessHidden(null, only("w1"), "e5")).toBe(false);
  });
});
