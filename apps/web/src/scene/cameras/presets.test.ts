import { describe, expect, test } from "vitest";
import { CAMERA_PRESETS, isCameraPreset, PRESET_KEYS } from "./presets";

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
  test("maps keys 1 to 4 to the four spec presets in order", () => {
    expect(PRESET_KEYS).toEqual({
      "1": "overview",
      "2": "counter_close",
      "3": "witness_claimed",
      "4": "witness_corrected",
    });
  });

  test("every mapped preset exists", () => {
    for (const preset of Object.values(PRESET_KEYS)) expect(isCameraPreset(preset)).toBe(true);
  });

  test("only the two witness presets are point-of-view", () => {
    const pov = Object.entries(CAMERA_PRESETS).filter(([, pose]) => pose.isPov).map(([name]) => name);
    expect(pov.sort()).toEqual(["witness_claimed", "witness_corrected"]);
  });
});
