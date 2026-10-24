import { describe, expect, test } from "vitest";
import { CAMERA_PRESETS, isCameraPreset, POV_KEY, PRESET_KEYS } from "./presets";

describe("isCameraPreset", () => {
  test("accepts every defined preset", () => {
    for (const name of Object.keys(CAMERA_PRESETS)) expect(isCameraPreset(name)).toBe(true);
  });

  test("rejects unknown names, null and undefined", () => {
    expect(isCameraPreset("nope")).toBe(false);
    expect(isCameraPreset("")).toBe(false);
    expect(isCameraPreset(null)).toBe(false);
    expect(isCameraPreset(undefined)).toBe(false);
  });

  test("rejects inherited object keys", () => {
    expect(isCameraPreset("toString")).toBe(false);
    expect(isCameraPreset("constructor")).toBe(false);
  });
});

describe("PRESET_KEYS", () => {
  test("1 is overview, 2 is POV, 3 and 4 are the counter close-up and corrected witness view", () => {
    expect(PRESET_KEYS).toEqual({
      "1": "overview",
      "3": "counter_close",
      "4": "witness_corrected",
    });
    expect(POV_KEY).toBe("2");
    expect(PRESET_KEYS[POV_KEY]).toBeUndefined();
  });

  test("every mapped preset exists", () => {
    for (const preset of Object.values(PRESET_KEYS)) expect(isCameraPreset(preset)).toBe(true);
  });

  test("only the two witness presets are point-of-view", () => {
    const pov = Object.entries(CAMERA_PRESETS).filter(([, pose]) => pose.isPov).map(([name]) => name);
    expect(pov.sort()).toEqual(["witness_claimed", "witness_corrected"]);
  });
});
