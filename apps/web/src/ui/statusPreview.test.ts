import { describe, expect, test } from "vitest";
import type { Status } from "../scene";
import { ALL_STATUSES, isStatusPreview, previewStatuses, searchWithoutPreview } from "./statusPreview";

const events = Array.from({ length: 10 }, (_, i) => ({ id: `e${i + 1}`, tStart: i }));

function apply(real: Record<string, Status>) {
  const changed = previewStatuses(events, (id) => real[id]!);
  return { changed, final: events.map((e) => changed[e.id] ?? real[e.id]!) };
}

describe("previewStatuses", () => {
  test("fills every status the real data lacks", () => {
    const real = Object.fromEntries(events.map((e) => [e.id, "plausible" as Status]));
    real.e5 = "implausible";
    const { changed, final } = apply(real);
    for (const status of ALL_STATUSES) expect(final).toContain(status);
    expect(changed.e5).toBeUndefined();
    expect(Object.keys(changed)).toHaveLength(3);
  });

  test("changes nothing when every status is already real", () => {
    const real: Record<string, Status> = Object.fromEntries(events.map((e) => [e.id, "plausible" as Status]));
    Object.assign(real, { e1: "proposed", e2: "implausible", e3: "overridden", e4: "superseded" });
    expect(apply(real).changed).toEqual({});
  });

  test("works from all-proposed data and keeps the original status present", () => {
    const real = Object.fromEntries(events.map((e) => [e.id, "proposed" as Status]));
    const { final } = apply(real);
    for (const status of ALL_STATUSES) expect(final).toContain(status);
  });

  test("never takes the last event of a status", () => {
    const few = events.slice(0, 2);
    const changed = previewStatuses(few, () => "plausible");
    const final = few.map((e) => changed[e.id] ?? "plausible");
    expect(final).toContain("plausible");
  });
});

describe("preview URL", () => {
  test("is on only for preview=statuses", () => {
    expect(isStatusPreview("?preview=statuses")).toBe(true);
    expect(isStatusPreview("?mode=live&preview=statuses")).toBe(true);
    expect(isStatusPreview("?preview=other")).toBe(false);
    expect(isStatusPreview("")).toBe(false);
  });

  test("exit link keeps the other params", () => {
    expect(searchWithoutPreview("?mode=live&preview=statuses")).toBe("?mode=live");
    expect(searchWithoutPreview("?preview=statuses")).toBe("");
  });
});
