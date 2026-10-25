import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test } from "vitest";
import { CLIP_NAMES, OPTIONAL_CLIP_NAMES } from "./clips";
import {
  buildRigDebugGraph,
  layoutRigDebugClips,
  RIG_DEBUG_CLIP_SPECS,
  rigDebugClipLines,
  type ClipDuration,
} from "./rigDebugGraph";
import { RigReportPanel } from "./RigReportPanel";
import { useRigReportStore } from "./rigReportStore";

const required = new Set<string>(CLIP_NAMES);
const everyClip: ClipDuration = () => 2.5;
const measured: Readonly<Record<string, number>> = { clip_phone: 37.233, clip_drink: 8.867 };
const withMeasured: ClipDuration = (name) => measured[name] ?? 2.5;
const evenLayout = layoutRigDebugClips(everyClip);
const evenGraph = buildRigDebugGraph(evenLayout);

describe("rig debug lists the new clips", () => {
  const initial = useRigReportStore.getInitialState();
  afterEach(() => Object.assign(initial, { clipLines: [] }));

  test("every new clip file has a rig debug event that plays it once the file exists", () => {
    const listed = RIG_DEBUG_CLIP_SPECS.map((entry) => entry.clip);
    expect(new Set(listed)).toEqual(new Set(OPTIONAL_CLIP_NAMES.filter((clip) => clip !== "clip_open_door")));
    expect(rigDebugClipLines(evenLayout, () => true).every((line) => line.plays === line.clip)).toBe(true);
  });

  test("each new clip gets its own window inside the graph's duration, after the original events", () => {
    const lines = rigDebugClipLines(evenLayout, () => true);
    for (const [index, line] of lines.entries()) {
      expect(line.tStart).toBeGreaterThanOrEqual(12);
      expect(line.tEnd).toBeLessThanOrEqual(evenGraph.durationS);
      const next = lines[index + 1];
      if (next) expect(line.tEnd).toBeLessThanOrEqual(next.tStart);
      const event = evenGraph.events.find((e) => e.id === line.eventId);
      expect(event).toMatchObject({ action: line.action, tStart: line.tStart, tEnd: line.tEnd });
      expect(event?.style).toBe(line.style);
    }
    expect(evenGraph.events.slice(0, 4).map((e) => e.id)).toEqual(["d1", "d2", "d3", "d4"]);
  });

  test("the panel names each new clip and the fallback that plays when its file is missing", () => {
    Object.assign(initial, { clipLines: rigDebugClipLines(evenLayout, (name) => required.has(name) || name === "clip_sneak") });
    const html = renderToStaticMarkup(<RigReportPanel />);
    for (const entry of RIG_DEBUG_CLIP_SPECS) expect(html).toContain(`data-clip="${entry.clip}"`);
    expect(html).toContain("walk sneak · clip_sneak</div>");
    expect(html).toContain("clip_dodge missing, plays clip_crouch_idle");
    expect(html).toContain("clip_throw missing, plays clip_punch");
  });

  test("with no clip loaded every slot is 2.5 s with 0.5 s gaps and the same starts as before", () => {
    const empty = layoutRigDebugClips(() => undefined);
    expect(empty.clips.map((c) => c.tStart)).toEqual(Array.from({ length: 15 }, (_, i) => 12 + 3 * i));
    expect(empty.clips.every((c) => c.tEnd - c.tStart === 2.5)).toBe(true);
    expect(empty.durationS).toBe(57.5);
  });

  test("a 37.233 s phone and an 8.867 s drink get slots of exactly those lengths and later slots shift", () => {
    const layout = layoutRigDebugClips(withMeasured);
    const slot = (clip: string) => layout.clips.find((c) => c.clip === clip)!;
    expect(slot("clip_phone").tEnd - slot("clip_phone").tStart).toBeCloseTo(37.233, 9);
    expect(slot("clip_drink").tEnd - slot("clip_drink").tStart).toBeCloseTo(8.867, 9);
    expect(slot("clip_phone").tStart).toBe(42);
    expect(slot("clip_open_door_out").tStart).toBeCloseTo(42 + 37.233 + 0.5, 9);
    const shift = 37.233 - 2.5 + (8.867 - 2.5);
    expect(slot("clip_dodge").tStart).toBeCloseTo(54 + shift, 9);
    expect(layout.durationS).toBeCloseTo(57.5 + shift, 9);
    layout.clips.forEach((c, i) => {
      const next = layout.clips[i + 1];
      if (next) expect(next.tStart - c.tEnd).toBeCloseTo(0.5, 9);
    });
  });

  test("a missing clip uses its fallback clip's own length", () => {
    const layout = layoutRigDebugClips((name) => ({ clip_talk: 5.17, clip_idle: 8.33 })[name as "clip_talk"]);
    const slot = (clip: string) => layout.clips.find((c) => c.clip === clip)!;
    expect(slot("clip_phone").tEnd - slot("clip_phone").tStart).toBeCloseTo(5.17, 9);
    expect(slot("clip_drink").tEnd - slot("clip_drink").tStart).toBeCloseTo(8.33, 9);
    expect(slot("clip_dodge").tEnd - slot("clip_dodge").tStart).toBe(2.5);
  });

  test("the graph carries the laid-out slots and the original events", () => {
    const layout = layoutRigDebugClips(withMeasured);
    const graph = buildRigDebugGraph(layout);
    expect(graph.durationS).toBe(layout.durationS);
    expect(graph.events.slice(0, 4).map((e) => [e.id, e.tStart, e.tEnd])).toEqual([
      ["d1", 0, 6],
      ["d2", 6, 8],
      ["d3", 0, 6],
      ["d4", 6, 12],
    ]);
    const phone = graph.events.find((e) => e.action === "phone")!;
    expect(phone.tEnd - phone.tStart).toBeCloseTo(37.233, 9);
  });
});
