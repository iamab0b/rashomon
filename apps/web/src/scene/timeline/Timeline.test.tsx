import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { gatedSnapshot } from "../playback/graphSource";
import { useSceneStore, type SceneState } from "../store";
import { Timeline, createDrag, makeJump, makeKeyHandler } from "./Timeline";
import { assignLanes, buildRows, fillOpacityFor, implausibleStarts, rowHeight, ROW_H, strokeFor } from "./layout";

const initial = useSceneStore.getState();
const pristine = { ...useSceneStore.getInitialState() };

function renderWith(patch: Partial<SceneState>): string {
  Object.assign(useSceneStore.getInitialState(), patch);
  try {
    return renderToStaticMarkup(<Timeline />);
  } finally {
    Object.assign(useSceneStore.getInitialState(), pristine);
  }
}
const snap = () => gatedSnapshot(robberyGraph, storeScene);

beforeEach(() => {
  useSceneStore.setState(initial, true);
  useSceneStore.getState().setGraph(snap());
});

describe("layout", () => {
  test("rows, block counts and e5 style", () => {
    const { resolved, statuses } = snap();
    const rows = buildRows(resolved, statuses);
    expect(rows.map((r) => r.id)).toEqual([...resolved!.actors.map((a) => a.id), "props"]);
    expect(rows).toHaveLength(4);
    for (const row of rows.slice(0, 3)) {
      expect(row.blocks.length).toBe(resolved!.events.filter((e) => e.actor === row.id).length);
    }
    const heldCount = resolved!.props.flatMap((p) => p.heldByIntervals ?? []).length;
    expect(rows[3]!.blocks).toHaveLength(heldCount);
    for (const block of rows[3]!.blocks) {
      expect(block.status).toBeUndefined();
      expect(strokeFor(block.status)).toEqual({ stroke: "#8a94a6", opacity: 1 });
    }
    const html = renderWith({ resolved, statuses, duration: resolved!.durationS });
    const propBlock = html.match(/<g data-block="p_knife:0"[^>]*>/)![0];
    expect(propBlock).not.toContain("data-status");
    expect(html).toContain('data-status="implausible"');
    const witness = rows.find((r) => r.blocks.some((b) => b.id === "e5"))!;
    const e5 = witness.blocks.find((b) => b.id === "e5")!;
    expect(e5.status).toBe("implausible");
    expect(e5.tStart).toBe(10);
    expect(e5.tEnd).toBe(12);
    expect(strokeFor(e5.status)).toMatchObject({ dash: "5 3", stroke: "#ff4d4f" });
    expect(strokeFor("proposed").opacity).toBe(0.4);
    expect(strokeFor("plausible").dash).toBeUndefined();
    expect(strokeFor("plausible").stroke).not.toBe("#ffffff");
    expect(strokeFor("overridden").stroke).not.toBe("#ffffff");
    expect(strokeFor("plausible", "#4f9dff")).toMatchObject({ stroke: "#4f9dff" });
    expect(strokeFor("overridden", "#ff9f43").stroke).toBe("#ff9f43");
    expect(strokeFor("implausible", "#4f9dff", true)).toMatchObject({ dash: "5 3", stroke: "#ff4d4f" });
    expect(strokeFor("plausible", "#4f9dff", true).opacity).toBeGreaterThan(strokeFor("plausible", "#4f9dff").opacity);
    expect(fillOpacityFor("plausible", true)).toBeGreaterThan(fillOpacityFor("plausible", false));
    expect(fillOpacityFor("implausible", true)).toBeLessThan(fillOpacityFor("plausible", true));
    expect(fillOpacityFor("implausible", true)).toBeGreaterThan(fillOpacityFor("implausible", false));
  });

  test("superseded events are hidden and counted", () => {
    const { resolved, statuses } = snap();
    const victim = resolved!.events.find((e) => e.id === "e1")!;
    const rows = buildRows(resolved, { ...statuses, e1: "superseded" });
    const row = rows.find((r) => r.id === victim.actor)!;
    expect(row.hidden).toBe(1);
    expect(row.blocks.some((b) => b.id === "e1")).toBe(false);
    const base = { resolved, duration: resolved!.durationS };
    expect(renderWith({ ...base, statuses })).not.toContain("hidden)");
    const html = renderWith({ ...base, statuses: { ...statuses, e1: "superseded" } });
    expect(html).toContain("(1 hidden)");
    expect(html).not.toContain('data-block="e1"');
  });
});

function fakeKey(key: string, shiftKey = false, tagName = "DIV") {
  let prevented = 0;
  return { key, shiftKey, target: { tagName }, preventDefault: () => void prevented++, count: () => prevented };
}

function drive() {
  const s = useSceneStore.getState();
  const { resolved, statuses } = snap();
  const api = () => useSceneStore.getState();
  const jump = (dir: 1 | -1) =>
    makeJump({ flags: implausibleStarts(resolved, statuses), t: api().t, select: s.select, setT: s.setT })(dir);
  const key = (k: string, shift = false, tag = "DIV") =>
    makeKeyHandler({ t: api().t, setT: s.setT, toggle: () => (api().playing ? s.pause() : s.play()) })(fakeKey(k, shift, tag));
  return { api, jump, key };
}

describe("lanes", () => {
  const block = (key: string, tStart: number, tEnd: number) => ({ key, id: key, tStart, tEnd, color: "#fff", label: key });

  test("overlapping events stack into sub-lanes without changing times or order", () => {
    const { resolved, statuses } = snap();
    const rows = buildRows(resolved, statuses);
    const witness = rows.find((r) => r.blocks.some((b) => b.id === "e5"))!;
    const lane = (id: string) => witness.blocks.find((b) => b.id === id)!.lane;
    expect(witness.lanes).toBe(2);
    expect(lane("e3")).toBe(0);
    expect(lane("e5")).toBe(1);
    expect(lane("e9")).toBe(0);
    expect(rowHeight(witness)).toBeGreaterThan(ROW_H);
    for (const row of rows) {
      for (const b of row.blocks) {
        const event = resolved!.events.find((e) => e.id === b.id);
        if (event) expect([b.tStart, b.tEnd]).toEqual([event.tStart, event.tEnd]);
      }
    }
    expect(rows.find((r) => r.id === "props")!.lanes).toBe(1);
    const html = renderWith({ resolved, statuses, duration: resolved!.durationS });
    expect(html).toContain('data-block="e5" data-lane="1"');
  });

  test("lane assignment is stable: start, then end, then id; touching blocks share a lane", () => {
    const input = [block("b", 0, 4), block("a", 0, 4), block("c", 0, 2), block("d", 4, 6)];
    const { blocks, lanes } = assignLanes(input);
    expect(blocks.map((b) => b.key)).toEqual(["b", "a", "c", "d"]);
    expect(Object.fromEntries(blocks.map((b) => [b.key, b.lane]))).toEqual({ c: 0, a: 1, b: 2, d: 0 });
    expect(lanes).toBe(3);
    expect(assignLanes([]).lanes).toBe(1);
  });
});

describe("interaction", () => {
  test("jump handler selects e5 and sets t to 10", () => {
    const { api, jump } = drive();
    jump(1);
    expect(api().selectedEventId).toBe("e5");
    expect(api().t).toBe(10);
    jump(1);
    expect(api().t).toBe(10);
    api().setT(11);
    jump(-1);
    expect(api().t).toBe(10);
  });

  test("key handler nudges, clamps and toggles play", () => {
    const { api, key } = drive();
    key("ArrowLeft");
    expect(api().t).toBe(0);
    key("ArrowRight");
    expect(api().t).toBe(0.5);
    key("ArrowRight", true);
    expect(api().t).toBeCloseTo(0.6);
    api().setT(api().duration - 0.05);
    key("ArrowRight", true);
    expect(api().t).toBe(api().duration);
    key(" ");
    expect(api().playing).toBe(true);
    key(" ", false, "BUTTON");
    expect(api().playing).toBe(true);
    key("a");
  });

  test("Home and End jump to the ends when duration is known", () => {
    const s = useSceneStore.getState();
    const api = () => useSceneStore.getState();
    const press = (k: string) =>
      makeKeyHandler({ t: api().t, setT: s.setT, toggle: () => {}, duration: api().duration })(fakeKey(k));
    api().setT(5);
    press("End");
    expect(api().t).toBe(api().duration);
    press("Home");
    expect(api().t).toBe(0);
  });

  test("only events under the playhead carry the playback tint, with status styling intact", () => {
    const { resolved, statuses } = snap();
    const html = renderWith({ resolved, statuses, duration: resolved!.durationS, t: 10.5 });
    const active = [...html.matchAll(/data-block="([^"]+)"[^>]*data-playback-active="true"/g)].map((m) => m[1]).sort();
    expect(active).toEqual(["e2", "e3", "e5", "e6"]);
    expect(html).toMatch(/data-block="e5"[^>]*data-status="implausible"[^>]*data-playback-active="true"/);
    expect(html).not.toMatch(/data-block="p_knife:0"[^>]*data-playback-active/);
  });

  test("playhead is a labelled slider", () => {
    const { resolved, statuses } = snap();
    const html = renderWith({ resolved, statuses, duration: resolved!.durationS, t: 3 });
    expect(html).toMatch(/<g data-playhead="true" class="rtl-playhead" role="slider" tabindex="0" aria-label="Playhead"/);
    expect(html).toContain('aria-valuetext="3.0 of ');
  });
});

describe("drag state machine", () => {
  const run = (end: "cancel" | "up" | "none" | "other") => {
    const drag = createDrag();
    const setT = vi.fn();
    const move = (id: number) => drag.move(id) && setT();
    expect(drag.down(1, 0)).toBe(true);
    move(1);
    expect(setT).toHaveBeenCalledTimes(1);
    if (end === "cancel" || end === "up") drag.end(1);
    if (end === "other") drag.end(2);
    move(1);
    return setT.mock.calls.length;
  };

  test("cancel and up stop scrubbing", () => {
    expect(run("cancel")).toBe(1);
    expect(run("up")).toBe(1);
  });

  test("other pointers neither scrub nor end the drag", () => {
    expect(run("other")).toBe(2);
    const drag = createDrag();
    drag.down(1, 0);
    expect(drag.move(2)).toBe(false);
  });

  test("a second down is ignored while a drag is active", () => {
    const drag = createDrag();
    drag.down(1, 0);
    expect(drag.down(2, 0)).toBe(false);
    expect(drag.move(1)).toBe(true);
    expect(drag.move(2)).toBe(false);
  });

  test("move without down and non-primary buttons do nothing", () => {
    const drag = createDrag();
    expect(drag.move(1)).toBe(false);
    expect(drag.down(1, 2)).toBe(false);
    expect(drag.move(1)).toBe(false);
  });
});
