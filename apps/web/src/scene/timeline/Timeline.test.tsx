import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test } from "vitest";
import { gatedSnapshot } from "../playback/graphSource";
import { useSceneStore, type SceneState } from "../store";
import { Timeline } from "./Timeline";
import { buildRows, implausibleStarts, neighborFlag, nudgeDelta, strokeFor } from "./layout";

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

describe("interaction", () => {
  test("jump to flag selects e5 and sets t to 10", () => {
    const { resolved, statuses } = snap();
    const target = neighborFlag(implausibleStarts(resolved, statuses), 0, 1)!;
    const s = useSceneStore.getState();
    s.select(target.id);
    s.setT(target.tStart);
    expect(useSceneStore.getState().selectedEventId).toBe("e5");
    expect(useSceneStore.getState().t).toBe(10);
    expect(neighborFlag(implausibleStarts(resolved, statuses), 10, 1)).toBeNull();
    expect(neighborFlag(implausibleStarts(resolved, statuses), 11, -1)?.id).toBe("e5");
  });

  test("keyboard nudges clamp at 0 and duration", () => {
    const s = useSceneStore.getState();
    const duration = s.duration;
    s.setT(0.2);
    s.setT(useSceneStore.getState().t + nudgeDelta("ArrowLeft", false)!);
    expect(useSceneStore.getState().t).toBe(0);
    s.setT(duration - 0.05);
    s.setT(useSceneStore.getState().t + nudgeDelta("ArrowRight", true)!);
    expect(useSceneStore.getState().t).toBe(duration);
    expect(nudgeDelta("ArrowLeft", true)).toBe(-0.1);
    expect(nudgeDelta("a", false)).toBeNull();
  });
});
