import { describe, expect, test } from "vitest";
import { parseMode, searchWithMode } from "./graphMode";

describe("parseMode", () => {
  test("defaults to fixture", () => {
    expect(parseMode("")).toBe("fixture");
    expect(parseMode("?fixture=store")).toBe("fixture");
  });

  test("reads live from the URL", () => {
    expect(parseMode("?mode=live")).toBe("live");
    expect(parseMode("?fixture=store&mode=live")).toBe("live");
  });

  test("treats unknown values as fixture", () => {
    expect(parseMode("?mode=LIVE")).toBe("fixture");
    expect(parseMode("?mode=backend")).toBe("fixture");
  });
});

describe("searchWithMode", () => {
  test("sets mode and keeps the other params", () => {
    expect(searchWithMode("?fixture=store&cam=overview", "live")).toBe("?fixture=store&cam=overview&mode=live");
  });

  test("replaces an existing mode", () => {
    expect(searchWithMode("?mode=live", "fixture")).toBe("?mode=fixture");
  });

  test("round-trips through parseMode", () => {
    expect(parseMode(searchWithMode("", "live"))).toBe("live");
    expect(parseMode(searchWithMode("?mode=live", "fixture"))).toBe("fixture");
  });
});
