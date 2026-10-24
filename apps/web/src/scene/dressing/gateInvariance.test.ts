import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { Group } from "three";
import { describe, expect, test } from "vitest";
import { landmarkOccluders } from "../cameras/landmarkOccluders";
import { buildPlaceholder } from "../loaders/scene";
import { gatedSnapshot } from "../playback/gatedSnapshot";
import { assembleDressing } from "./assemble";
import { dressingPlan, dressingUrls } from "./dressingPlan";
import { hidePlaceholderBoxes } from "./placeholders";
import { boxModel } from "./testModels";

function verdict() {
  const snapshot = gatedSnapshot(robberyGraph, storeScene);
  return JSON.stringify({ statuses: snapshot.statuses, flags: (snapshot.resolved?.events ?? []).map((event) => [event.id, event.status, event.flags]) });
}

function occluderState() {
  return landmarkOccluders(storeScene).boxes.map((box) => [box.name, box.position.toArray(), box.geometry.boundingBox?.max.toArray() ?? null]);
}

describe("store dressing and the gate", () => {
  test("leaves statuses, flags and occluders byte-identical once dressing is mounted", () => {
    const before = verdict();
    const occludersBefore = JSON.stringify(occluderState());

    const plan = dressingPlan(storeScene);
    const models = new Map(dressingUrls(plan).map((url) => [url, boxModel(0.4, 0.88, 0.25, "corner")]));
    const assembled = assembleDressing(plan, models);
    const scene = new Group();
    scene.add(buildPlaceholder(storeScene), assembled.group);
    hidePlaceholderBoxes(scene, assembled.coveredLandmarks);

    expect(assembled.coveredLandmarks.size).toBeGreaterThan(0);
    expect(verdict()).toBe(before);
    expect(JSON.stringify(occluderState())).toBe(occludersBefore);
  });

  test("still reports the fixture verdict: e5 implausible, blocked by shelf_a", () => {
    const snapshot = gatedSnapshot(robberyGraph, storeScene);
    expect(snapshot.statuses.e5).toBe("implausible");
    const blocked = snapshot.resolved?.events.find((event) => event.id === "e5")?.flags ?? [];
    expect(JSON.stringify(blocked)).toContain("shelf_a");
  });

  test("keeps dressing out of the occluder group the POV dimming reads", () => {
    const plan = dressingPlan(storeScene);
    const models = new Map(dressingUrls(plan).map((url) => [url, boxModel(0.4, 0.88, 0.25, "corner")]));
    const { group } = assembleDressing(plan, models);
    const occluders = landmarkOccluders(storeScene);
    group.traverse((object) => {
      expect(occluders.group.getObjectById(object.id)).toBeUndefined();
    });
    expect(occluders.boxes.map((box) => box.name).sort()).toEqual(["cooler", "counter", "shelf_a", "shelf_b"]);
  });
});
