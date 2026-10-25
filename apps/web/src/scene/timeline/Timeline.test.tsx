import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { gatedSnapshot } from "../playback/graphSource";
import { useSceneStore, type SceneState } from "../store";
import { Timeline, createDrag, makeJump, makeKeyHandler } from "./Timeline";
import { callHook, findElement } from "../testing/hookHost";
import { isValidElement, type ReactNode } from "react";
import {
  assignLanes,
  buildRows,
  fillOpacityFor,
  hits,
  implausibleStarts,
  LANE_H,
  rowHeight,
  rowTops,
  ROW_H,
  strokeFor,
  TOP,
  xOf,
} from "./layout";

const initial = useSceneStore.getState();
const pristine = { ...useSceneStore.getInitialState() };

function renderWith(patch: Partial<SceneState>): string {
  Object.assign(useSceneStore.getInitialState(), patch);
  try {
    return renderToStaticMarkup(createElement(Timeline));
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

describe("nested blocks stay clickable", () => {
  test("longer blocks are painted first, so e5 sits on top of the e3 block that contains it", () => {
    const { resolved, statuses } = snap();
    const witness = buildRows(resolved, statuses).find((r) => r.blocks.some((b) => b.id === "e5"))!;
    const order = witness.blocks.map((b) => b.id);
    expect(order.indexOf("e5")).toBeGreaterThan(order.indexOf("e3"));
    const durations = witness.blocks.map((b) => b.tEnd - b.tStart);
    expect(durations).toEqual([...durations].sort((a, b) => b - a));
    const html = renderWith({ resolved, statuses, duration: resolved!.durationS });
    expect(html.indexOf('data-block="e5"')).toBeGreaterThan(html.indexOf('data-block="e3"'));
  });

  test("clicking e5's rendered block selects e5, and e3's block selects e3", () => {
    const tree = callHook(() => Timeline({}));
    const blockOf = (id: string) => findElement(tree, (props) => props["data-block"] === id);
    for (const id of ["e5", "e3", "e9"]) {
      const block = blockOf(id);
      expect(block, id).not.toBeNull();
      const onClick = block!.props as { onClick: () => void };
      onClick.onClick();
      expect(useSceneStore.getState().selectedEventId).toBe(id);
      useSceneStore.getState().clear();
    }
    expect(blockOf("p_knife:0")).not.toBeNull();
    (blockOf("p_knife:0")!.props as { onClick: () => void }).onClick();
    expect(useSceneStore.getState().selectedEventId).toBeNull();
  });
});

describe("event state styling (regression)", () => {
  const WITNESS = "#4f9dff";
  const SUSPECT = "#ff9f43";
  const CLERK = "#4cd6a0";
  const render = () => {
    const { resolved, statuses } = snap();
    return renderWith({
      resolved,
      statuses: { ...statuses, e2: "overridden" },
      duration: resolved!.durationS,
      t: 10.5,
      selectedEventId: "e5",
    });
  };
  const block = (html: string, id: string) => html.match(new RegExp(`<g data-block="${id}"[^>]*>(.*?)</g>`))![0];
  const fill = (markup: string) => markup.match(/<rect [^>]*class="rtl-fill"[^>]*>/)![0];
  const border = (markup: string) => markup.match(/<rect [^>]*fill="none" stroke="[^"]*" stroke-opacity[^>]*>/)![0];

  test("overlapping events from one actor sit on separate lanes; later events reuse lane 0", () => {
    const html = render();
    expect(block(html, "e3")).toContain('data-lane="0"');
    expect(block(html, "e5")).toContain('data-lane="1"');
    expect(block(html, "e9")).toContain('data-lane="0"');
  });

  test("a default event has a faint fill and a muted border in its actor's color", () => {
    const e9 = block(render(), "e9");
    expect(e9).not.toContain("data-playback-active");
    expect(fill(e9)).toMatch(new RegExp(`fill="${WITNESS}" fill-opacity="0.14"`));
    expect(border(e9)).toMatch(new RegExp(`stroke="${WITNESS}" stroke-opacity="0.55"`));
    expect(border(e9)).not.toContain("stroke-dasharray");
    expect(e9).not.toContain('stroke="#fff"');
  });

  test("a playing event gets a stronger tint of its own actor color, never a shared blue", () => {
    const html = render();
    const e3 = block(html, "e3");
    expect(e3).toContain('data-playback-active="true"');
    expect(fill(e3)).toMatch(new RegExp(`fill="${WITNESS}" fill-opacity="0.34"`));
    expect(border(e3)).toMatch(new RegExp(`stroke="${WITNESS}" stroke-opacity="0.9"`));
    expect(fill(block(html, "e6"))).toMatch(new RegExp(`fill="${SUSPECT}" fill-opacity="0.34"`));
    expect(html).not.toContain("#4f8cff");
  });

  test("the selected event has a white outline", () => {
    const html = render();
    expect(block(html, "e5")).toMatch(/<rect [^>]*fill="none" stroke="#fff"/);
    expect(block(html, "e3")).not.toContain('stroke="#fff"');
  });

  test("implausible keeps its red dashed border while playing, with only a restrained tint", () => {
    const e5 = block(render(), "e5");
    expect(e5).toContain('data-status="implausible"');
    expect(border(e5)).toMatch(/stroke="#ff4d4f" stroke-opacity="1" stroke-dasharray="5 3"/);
    expect(fill(e5)).toMatch(new RegExp(`fill="${WITNESS}" fill-opacity="0.24"`));
  });

  test("non-overlapping events from one actor share a lane", () => {
    const { blocks, lanes } = assignLanes([
      { key: "a", id: "a", tStart: 0, tEnd: 3, color: WITNESS, label: "a" },
      { key: "b", id: "b", tStart: 3, tEnd: 5, color: WITNESS, label: "b" },
      { key: "c", id: "c", tStart: 6, tEnd: 8, color: WITNESS, label: "c" },
    ]);
    expect(blocks.map((b) => b.lane)).toEqual([0, 0, 0]);
    expect(lanes).toBe(1);
  });

  test("the timeline keeps 14px below the last row and its text is not selectable", () => {
    const html = render();
    expect(html).toMatch(/class="rtl-root"[^>]*style="[^"]*padding-bottom:14px/);
    expect(html).toContain("user-select: none");
    expect(html).toMatch(/\.rtl-root \{ cursor: default; \}/);
    expect(html).toMatch(/data-playhead="true"[^>]*style="cursor:ew-resize"/);
    expect(block(html, "e3")).toContain('style="cursor:pointer"');
  });

  test("overridden keeps its amber corner while playing, with only a restrained tint", () => {
    const e2 = block(render(), "e2");
    expect(e2).toContain('data-status="overridden"');
    expect(e2).toMatch(/<polygon [^>]*fill="#ffb020"/);
    expect(fill(e2)).toMatch(new RegExp(`fill="${CLERK}" fill-opacity="0.24"`));
    expect(border(e2)).toMatch(new RegExp(`stroke="${CLERK}"`));
  });
});

function collect(node: ReactNode, matches: (props: Record<string, unknown>) => boolean): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap((child) => collect(child, matches));
  if (!isValidElement(node)) return [];
  const props = node.props as Record<string, unknown>;
  return [...(matches(props) ? [props] : []), ...collect(props.children as ReactNode, matches)];
}

describe("playhead hit area", () => {
  test("after Next flag sets t = 10, a click just inside e5's left edge selects e5 instead of scrubbing", () => {
    const { api, jump } = drive();
    api().clear();
    api().setT(0);
    jump(1);
    expect(api().t).toBe(10);
    api().clear();

    const { resolved, statuses } = snap();
    const rows = buildRows(resolved, statuses);
    const witness = rows.findIndex((r) => r.blocks.some((b) => b.id === "e5"));
    const lane = rows[witness]!.blocks.find((b) => b.id === "e5")!.lane;
    const duration = api().duration;
    const px = xOf(10, duration) + 2;
    const py = rowTops(rows)[witness]! + lane * LANE_H + ROW_H / 2;
    expect(px).toBeLessThan(xOf(12, duration));

    const tree = callHook(() => Timeline({}));
    const hitRects = collect(tree, (props) => props["data-playhead-hit"] === true) as unknown as {
      x: number;
      y: number;
      width: number;
      height: number;
    }[];
    expect(hitRects.length).toBe(2);
    expect(hitRects.some((r) => hits(r, px, py))).toBe(false);
    expect(hitRects.some((r) => hits(r, xOf(10, duration), TOP / 2))).toBe(true);
    for (const r of hitRects) if (r.y + r.height > TOP) expect(r.width).toBeLessThanOrEqual(2);

    const e5 = findElement(tree, (props) => props["data-block"] === "e5")!;
    (e5.props as { onClick: () => void }).onClick();
    expect(api().selectedEventId).toBe("e5");
  });
});

describe("toolbar", () => {
  const toolbar = (patch: Partial<SceneState>) => {
    const { resolved, statuses } = snap();
    const html = renderWith({ resolved, statuses, duration: resolved!.durationS, ...patch });
    return html.slice(html.indexOf('class="rtl-toolbar"'), html.indexOf("<svg", html.indexOf('class="rtl-time"')));
  };

  test("play/pause is one labelled icon button that follows the playing state", () => {
    expect(toolbar({ playing: false })).toMatch(/class="rtl-play" aria-label="Play" title="Play \(Space\)" aria-keyshortcuts="Space"/);
    expect(toolbar({ playing: true })).toMatch(/class="rtl-play" aria-label="Pause" title="Pause \(Space\)"/);
  });

  test("speeds are one labelled group with exactly one pressed", () => {
    const html = toolbar({ speed: 2 });
    expect(html).toContain('role="group" aria-label="Playback speed"');
    const pressed = [...html.matchAll(/aria-pressed="(true|false)"[^>]*>([^<]+)</g)].map((m) => `${m[2]}:${m[1]}`);
    expect(pressed).toEqual(["0.5×:false", "1×:false", "2×:true"]);
  });

  test("flag navigation is its own group with arrows, text and disabled ends", () => {
    const start = toolbar({ t: 0 });
    expect(start).toContain('role="group" aria-label="Flag navigation"');
    expect(start).toMatch(/aria-label="Previous flag" title="Previous flag" disabled=""/);
    expect(start).toMatch(/aria-label="Next flag" title="Next flag">/);
    expect(start).toContain("Previous flag</span>");
    expect(start).toContain("→");
    const after = toolbar({ t: 11 });
    expect(after).toMatch(/aria-label="Previous flag" title="Previous flag">/);
    expect(after).toMatch(/aria-label="Next flag" title="Next flag" disabled=""/);
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

describe("approximated events", () => {
  const ducked = {
    ...robberyGraph,
    events: robberyGraph.events.map((e) => (e.id === "e9" ? { ...e, actionApproximated: true, verb: "ducked" } : e)),
  };
  const block = (html: string, id: string) => html.match(new RegExp(`<g data-block="${id}"[^>]*>(.*?)</g>`))![0];
  const border = (markup: string) => markup.match(/<rect [^>]*fill="none" stroke="[^"]*" stroke-opacity[^>]*>/)![0];

  test("an approximated event draws a dashed block and carries its flag and verb; its status is the gate's", () => {
    const { resolved, statuses } = gatedSnapshot(ducked, storeScene);
    const html = renderWith({ resolved, statuses, duration: resolved!.durationS, t: 0 });
    const e9 = block(html, "e9");
    expect(e9).toContain('data-approximated="true"');
    expect(e9).toContain('data-verb="ducked"');
    expect(e9).toContain(`data-status="${statuses.e9}"`);
    expect(statuses).toEqual(snap().statuses);
    expect(border(e9)).toMatch(/stroke="#4f9dff" stroke-opacity="0.55" stroke-dasharray="2 3"/);
    const e1 = block(html, "e1");
    expect(e1).not.toContain("data-approximated");
    expect(border(e1)).not.toContain("stroke-dasharray");
    expect(resolved!.events.find((e) => e.id === "e9")).toMatchObject({ actionApproximated: true, verb: "ducked" });
  });

  test("buildRows copies the flag and verb onto the block, and strokeFor dashes it without changing its color", () => {
    const { resolved, statuses } = gatedSnapshot(ducked, storeScene);
    const blocks = buildRows(resolved!, statuses).flatMap((row) => row.blocks);
    expect(blocks.find((b) => b.id === "e9")).toMatchObject({ actionApproximated: true, verb: "ducked" });
    expect(blocks.find((b) => b.id === "e1")).not.toHaveProperty("actionApproximated");
    expect(strokeFor("plausible", "#4f9dff", false, true)).toEqual({ dash: "2 3", stroke: "#4f9dff", opacity: 0.55 });
    expect(strokeFor("implausible", "#4f9dff", false, true)).toMatchObject({ dash: "2 3", stroke: "#ff4d4f" });
  });
});
