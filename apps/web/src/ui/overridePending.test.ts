import { describe, expect, test } from "vitest";
import { canOverride, eventDisplay } from "./overridePending";

const e5 = { id: "e5", status: "proposed" as const };

describe("eventDisplay", () => {
  test("a confirmed override the gate has not applied keeps e5 implausible, with the pending note", () => {
    const shown = eventDisplay(e5, { e5: "implausible" }, { e5: "Witness corrected position on re-interview" });
    expect(shown.status).toBe("implausible");
    expect(shown.pendingNote).toBe("Override pending: Witness corrected position on re-interview");
  });

  test("once the gate returns overridden, the pending note goes away", () => {
    const shown = eventDisplay(e5, { e5: "overridden" }, { e5: "Witness corrected position" });
    expect(shown).toEqual({ status: "overridden", pendingNote: null });
  });

  test("an event that already carries the override shows no pending note", () => {
    const withOverride = { ...e5, override: { by: "investigator", reason: "Witness corrected", at: 0, flagIds: [] } };
    expect(eventDisplay(withOverride, { e5: "implausible" }, { e5: "Witness corrected" }).pendingNote).toBeNull();
  });

  test("without a gate status the resolved status is shown and nothing is pending", () => {
    expect(eventDisplay(e5, {}, {})).toEqual({ status: "proposed", pendingNote: null });
  });
});

describe("canOverride", () => {
  test("only an event the gate marks implausible offers Override", () => {
    expect(canOverride("implausible")).toBe(true);
    for (const status of ["plausible", "proposed", "overridden", "superseded"] as const) {
      expect(canOverride(status)).toBe(false);
    }
  });
});
