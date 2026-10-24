import { describe, expect, test } from "vitest";
import type { ResolvedEvent, Status } from "../scene";
import { inDisplayOrder, isPlaybackActive, playbackActiveIds, spaceTogglesPlayback } from "./playback";

const ev = (id: string, tStart: number, tEnd: number, status: Status = "plausible") =>
  ({ id, tStart, tEnd, status }) as ResolvedEvent;

describe("isPlaybackActive", () => {
  test("an event is active from its start up to, but not at, its end", () => {
    const e = ev("e1", 2, 5);
    expect(isPlaybackActive(e, 1.99)).toBe(false);
    expect(isPlaybackActive(e, 2)).toBe(true);
    expect(isPlaybackActive(e, 4.99)).toBe(true);
    expect(isPlaybackActive(e, 5)).toBe(false);
  });

  test("at a hand-off only the event that starts is active", () => {
    const events = [ev("a", 0, 3), ev("b", 3, 6)];
    expect([...playbackActiveIds(events, 3, (e) => e.status)]).toEqual(["b"]);
  });

  test("overlapping events are all active", () => {
    const events = [ev("a", 0, 4), ev("b", 2, 6), ev("c", 5, 8)];
    expect([...playbackActiveIds(events, 3, (e) => e.status)].sort()).toEqual(["a", "b"]);
  });

  test("superseded events are never playback-active", () => {
    const events = [ev("a", 0, 4), ev("b", 0, 4)];
    expect([...playbackActiveIds(events, 1, (e) => (e.id === "b" ? "superseded" : e.status))]).toEqual(["a"]);
  });
});

describe("inDisplayOrder", () => {
  test("sorts by start, then end, then id, without touching the source array", () => {
    const source = [ev("e9", 4, 6), ev("e3", 1, 5), ev("e2", 1, 3), ev("e1", 1, 3), ev("e0", 0, 9)];
    const before = source.map((e) => e.id);
    expect(inDisplayOrder(source).map((e) => e.id)).toEqual(["e0", "e1", "e2", "e3", "e9"]);
    expect(source.map((e) => e.id)).toEqual(before);
  });
});

describe("spaceTogglesPlayback", () => {
  const page = { closest: () => null };
  const inside = (selector: string) => ({ closest: (s: string) => (s.includes(selector) ? {} : null) });

  test("Space on the page toggles playback", () => {
    expect(spaceTogglesPlayback({ key: " ", target: page })).toBe(true);
  });

  test("Space inside a text field, select, button or editable region is left alone", () => {
    for (const selector of ["input", "textarea", "select", "button", "[contenteditable]"]) {
      expect(spaceTogglesPlayback({ key: " ", target: inside(selector) })).toBe(false);
    }
    expect(spaceTogglesPlayback({ key: " ", target: { closest: () => null, isContentEditable: true } })).toBe(false);
  });

  test("other keys, modified Space and already handled Space do nothing", () => {
    expect(spaceTogglesPlayback({ key: "k", target: page })).toBe(false);
    expect(spaceTogglesPlayback({ key: " ", metaKey: true, target: page })).toBe(false);
    expect(spaceTogglesPlayback({ key: " ", defaultPrevented: true, target: page })).toBe(false);
  });
});
