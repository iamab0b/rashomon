import { describe, expect, test } from "vitest";
import { buildOverride, canConfirm, MIN_REASON_LENGTH } from "./overrideReason";

describe("canConfirm", () => {
  test("stays disabled under 10 characters", () => {
    expect(MIN_REASON_LENGTH).toBe(10);
    expect(canConfirm("")).toBe(false);
    expect(canConfirm("123456789")).toBe(false);
  });

  test("ignores leading and trailing whitespace", () => {
    expect(canConfirm("          ")).toBe(false);
    expect(canConfirm("   short   ")).toBe(false);
  });

  test("enables at 10 characters", () => {
    expect(canConfirm("1234567890")).toBe(true);
    expect(canConfirm("witness stood on the step stool")).toBe(true);
  });
});

describe("buildOverride", () => {
  test("returns the schema's Override with a trimmed reason", () => {
    expect(buildOverride("investigator", "  stood on the step stool ", ["f1"], 1700000000000)).toEqual({
      by: "investigator",
      reason: "stood on the step stool",
      at: 1700000000000,
      flagIds: ["f1"],
    });
  });

  test("refuses a reason that is too short", () => {
    expect(() => buildOverride("investigator", "too short", ["f1"], 0)).toThrow();
  });
});
