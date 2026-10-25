import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test } from "vitest";
import { CLIP_NAMES, OPTIONAL_CLIP_NAMES } from "./clips";
import { ACTOR_BODIES } from "@rashomon/schema";
import { RIG_DEBUG_GRAPH, RIG_DEBUG_NEW_CLIPS, rigDebugActors, rigDebugBodies, rigDebugClipLines, rigDebugGraph } from "./rigDebugGraph";
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

describe("rig debug shows bodies", () => {
  const initial = useRigReportStore.getInitialState();
  afterEach(() => Object.assign(initial, { reports: [] }));

  test("?body= takes a body, its file name, or all, and names anything else as unknown", () => {
    expect(rigDebugBodies("?debug=rig&body=body_heavy_tall")).toEqual({ bodies: ["heavy_tall"] });
    expect(rigDebugBodies("?debug=rig&body=slim_short")).toEqual({ bodies: ["slim_short"] });
    expect(rigDebugBodies("?debug=rig&body=all")).toEqual({ bodies: ACTOR_BODIES });
    expect(rigDebugBodies("?debug=rig&body=muscular")).toEqual({ bodies: [], unknown: "muscular" });
    expect(rigDebugBodies("?debug=rig")).toEqual({ bodies: [] });
  });

  test("a body idles for the whole debug graph beside the two rigs, which are unchanged", () => {
    const graph = rigDebugGraph(["heavy_tall"]);
    expect(graph.actors.map((a) => a.id)).toEqual(["debug_ybot", "debug_xbot", "debug_heavy_tall"]);
    expect(graph.events.filter((e) => e.actor === "debug_heavy_tall")).toMatchObject([
      { action: "stand", tStart: 0, tEnd: RIG_DEBUG_GRAPH.durationS },
    ]);
    expect(graph.events.slice(0, RIG_DEBUG_GRAPH.events.length)).toEqual(RIG_DEBUG_GRAPH.events);
    expect(rigDebugActors(["heavy_tall"])[2]).toMatchObject({ body: "heavy_tall", rig: "mixamo_ybot" });
    const all = rigDebugActors(ACTOR_BODIES).slice(2);
    expect(new Set(all.map((a) => a.position.join(","))).size).toBe(6);
  });

  test("the report lists each body's bone count, measured height and eye height, beside the gate's 1.6 m", () => {
    Object.assign(initial, {
      reports: [
        { name: "mixamo_ybot", bones: 65, hipBone: "mixamorigHips", hipY: 1.0, eyeY: 1.62, eyeEstimated: true, height: 1.8 },
        { name: "heavy_tall", bones: 65, hipBone: "mixamorigHips", hipY: 1.04, eyeY: 1.74, eyeEstimated: false, height: 1.86 },
      ],
    });
    const html = renderToStaticMarkup(<RigReportPanel />);
    expect(html).toContain("eye height 1.6 m for everyone");
    expect(html).toContain('data-rig="heavy_tall">heavy_tall: 65 bones · mixamorigHips · hip y 1.04 m · eye y 1.74 m · height 1.86 m</div>');
    expect(html).toContain("eye y 1.62 m (est.) · height 1.80 m");
  });
});
