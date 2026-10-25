import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test } from "vitest";
import { CLIP_NAMES, OPTIONAL_CLIP_NAMES } from "./clips";
import { RIG_DEBUG_GRAPH, RIG_DEBUG_NEW_CLIPS, rigDebugClipLines } from "./rigDebugGraph";
import { RigReportPanel } from "./RigReportPanel";
import { useRigReportStore } from "./rigReportStore";

const required = new Set<string>(CLIP_NAMES);

describe("rig debug lists the new clips", () => {
  const initial = useRigReportStore.getInitialState();
  afterEach(() => Object.assign(initial, { clipLines: [] }));

  test("every new clip file has a rig debug event that plays it once the file exists", () => {
    const listed = RIG_DEBUG_NEW_CLIPS.map((entry) => entry.clip);
    expect(new Set(listed)).toEqual(new Set(OPTIONAL_CLIP_NAMES.filter((clip) => clip !== "clip_open_door")));
    expect(rigDebugClipLines(() => true).every((line) => line.plays === line.clip)).toBe(true);
  });

  test("each new clip gets its own window inside the graph's duration, after the original events", () => {
    const lines = rigDebugClipLines(() => true);
    for (const [index, line] of lines.entries()) {
      expect(line.tStart).toBeGreaterThanOrEqual(12);
      expect(line.tEnd).toBeLessThanOrEqual(RIG_DEBUG_GRAPH.durationS);
      const next = lines[index + 1];
      if (next) expect(line.tEnd).toBeLessThanOrEqual(next.tStart);
      const event = RIG_DEBUG_GRAPH.events.find((e) => e.id === line.eventId);
      expect(event).toMatchObject({ action: line.action, tStart: line.tStart, tEnd: line.tEnd });
      expect(event?.style).toBe(line.style);
    }
    expect(RIG_DEBUG_GRAPH.events.slice(0, 4).map((e) => e.id)).toEqual(["d1", "d2", "d3", "d4"]);
  });

  test("the panel names each new clip and the fallback that plays when its file is missing", () => {
    Object.assign(initial, { clipLines: rigDebugClipLines((name) => required.has(name) || name === "clip_sneak") });
    const html = renderToStaticMarkup(<RigReportPanel />);
    for (const entry of RIG_DEBUG_NEW_CLIPS) expect(html).toContain(`data-clip="${entry.clip}"`);
    expect(html).toContain("walk sneak · clip_sneak</div>");
    expect(html).toContain("clip_dodge missing, plays clip_crouch_idle");
    expect(html).toContain("clip_throw missing, plays clip_punch");
  });
});
