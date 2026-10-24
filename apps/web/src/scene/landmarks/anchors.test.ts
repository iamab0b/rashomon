import type { Landmark } from "@rashomon/schema";
import { describe, expect, test } from "vitest";
import { labelAnchor } from "./anchors";

const base: Landmark = {
  id: "x",
  label: "x",
  aliases: [],
  position: [1.9, 0, 3.3],
  bounds: { min: [2.4, 0, 1.6], max: [3.4, 1.8, 5.0] },
  kind: "furniture",
  occludes: true,
};

describe("labelAnchor", () => {
  test("occluders anchor at the top centre of their bounds", () => {
    const [x, y, z] = labelAnchor(base);

    expect(x).toBeCloseTo(2.9);
    expect(y).toBe(1.8);
    expect(z).toBeCloseTo(3.3);
  });

  test("non-occluders anchor at the landmark position", () => {
    expect(labelAnchor({ ...base, occludes: false, kind: "zone" })).toEqual([1.9, 0, 3.3]);
  });

  test("does not return the landmark's own position array", () => {
    const anchor = labelAnchor({ ...base, occludes: false });

    expect(anchor).not.toBe(base.position);
  });
});
