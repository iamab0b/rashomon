import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { gatedSnapshot } from "../playback/graphSource";
import { useSceneStore, type SceneState } from "../store";
import { Timeline, createDrag, makeJump, makeKeyHandler } from "./Timeline";
import { buildRows, implausibleStarts, strokeFor } from "./layout";

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
    const witness = rows.find((r) => r.blocks.some((b) => b.id === "e5"))!;
    const e5 = witness.blocks.find((b) => b.id === "e5")!;
    expect(e5.status).toBe("implausible");
    expect(e5.tStart).toBe(10);
    expect(e5.tEnd).toBe(12);
    expect(strokeFor(e5.status)).toMatchObject({ dash: "5 3", stroke: "#ff4d4f" });
    expect(strokeFor("proposed").opacity).toBe(0.4);
    expect(strokeFor("plausible").dash).toBeUndefined();
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

  test("move without down and non-primary buttons do nothing", () => {
    const drag = createDrag();
    expect(drag.move(1)).toBe(false);
    expect(drag.down(1, 2)).toBe(false);
    expect(drag.move(1)).toBe(false);
  });
});
