import { describe, expect, it } from "vitest";
import { parseShotRequest, shotFileName, shotQuery } from "./shotRequest";

function parsed(body: unknown) {
  const result = parseShotRequest(body);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("parseShotRequest", () => {
  it("accepts a full request and fills defaults", () => {
    expect(parsed({ fixture: "store", scenario: "corrected", cam: "pov", t: 11 })).toEqual({
      fixture: "store",
      scenario: "corrected",
      cam: "pov",
      t: 11,
    });
    expect(parsed({})).toEqual({ fixture: "store", scenario: null, cam: "overview", t: 0 });
    expect(parsed({ mode: "fixture", cam: "witness_claimed", t: 11.04 }).t).toBe(11);
  });

  it.each([
    ["a non-object body", "nope"],
    ["an array body", []],
    ["an unknown field", { cam: "overview", out: "x.png" }],
    ["a fixture with a slash", { fixture: "../store" }],
    ["an upper-case fixture", { fixture: "Store" }],
    ["an empty fixture", { fixture: "" }],
    ["a fixture over 32 characters", { fixture: "a".repeat(33) }],
    ["a scenario with a slash", { scenario: "a/b" }],
    ["a scenario with a dot", { scenario: "corrected.png" }],
    ["a numeric scenario", { scenario: 3 }],
    ["an unknown camera", { cam: "top_down" }],
    ["an inherited camera key", { cam: "constructor" }],
    ["a non-string camera", { cam: 1 }],
    ["a string t", { t: "11" }],
    ["a negative t", { t: -1 }],
    ["t = 1e9", { t: 1e9 }],
    ["t just over 600", { t: 600.1 }],
    ["t = NaN", { t: Number.NaN }],
    ["t = Infinity", { t: Number.POSITIVE_INFINITY }],
    ["an unknown mode", { mode: "replay" }],
  ])("rejects %s", (_name, body) => {
    expect(parseShotRequest(body).ok).toBe(false);
  });

  it("rejects mode=live and says why", () => {
    const result = parseShotRequest({ mode: "live", cam: "overview", t: 3 });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toMatch(/live data/);
  });

  it("accepts the boundary values of t and every camera preset", () => {
    expect(parsed({ t: 0 }).t).toBe(0);
    expect(parsed({ t: 600 }).t).toBe(600);
    for (const cam of ["overview", "counter_close", "witness_claimed", "witness_corrected", "rig_debug", "pov"]) {
      expect(parsed({ cam }).cam).toBe(cam);
    }
  });
});

describe("shotFileName and shotQuery", () => {
  it("names the file from cam and t, adding the scenario when given", () => {
    expect(shotFileName(parsed({ cam: "witness_claimed", t: 11 }))).toBe("witness_claimed-t11.png");
    expect(shotFileName(parsed({ cam: "witness_claimed", t: 11, scenario: "corrected" }))).toBe(
      "witness_claimed-t11-corrected.png",
    );
    expect(shotFileName(parsed({ cam: "pov", t: 3.5 }))).toBe("pov-t3.5.png");
  });

  it("builds the query the way shot.ts does", () => {
    expect(shotQuery(parsed({ cam: "pov", t: 11 }))).toBe("fixture=store&cam=pov&t=11");
    expect(shotQuery(parsed({ cam: "overview", t: 11, scenario: "corrected" }))).toBe(
      "fixture=store&cam=overview&t=11&scenario=corrected",
    );
  });
});
