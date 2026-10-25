import { robberyGraph } from "@rashomon/schema/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { EventsTab } from "./EventsTab";
import { PanelHeader } from "./PanelHeader";
import { timeBasis, type PanelContext } from "./shared";
import { gatedRobbery } from "./testGraph";

function context(): PanelContext {
  return {
    graph: gatedRobbery()!,
    statusOf: (event) => event.status,
    pendingNoteOf: () => null,
    isPending: () => false,
    selectedEventId: null,
    playbackActive: new Set(),
    placeOf: () => null,
    timeBasisOf: (event) => timeBasis(robberyGraph, event),
    witnessOf: () => null,
    playing: false,
    jumpTo: () => {},
    openOverride: () => {},
    openSource: () => {},
    openHistory: () => {},
    openStatement: () => {},
    notify: () => {},
    transcript: null,
  };
}

const card = (html: string, id: string) => html.match(new RegExp(`data-event-id="${id}".*?investigation-event__body`, "s"))![0];

describe("stated and inferred time", () => {
  test("tConfidence on the raw event decides, and a time the resolver filled in is inferred too", () => {
    const graph = gatedRobbery()!;
    const e2 = graph.events.find((e) => e.id === "e2")!;
    const e9 = graph.events.find((e) => e.id === "e9")!;
    expect(e2.tInferred).toBe(false);
    expect(timeBasis(robberyGraph, e2)).toBe("inferred");
    expect(timeBasis(robberyGraph, e9)).toBe("stated");
    expect(timeBasis(robberyGraph, { ...e9, tInferred: true })).toBe("inferred");
    expect(timeBasis(null, e2)).toBe("stated");
  });

  test("only inferred times get the Estimated Time label, with an explanation on hover", () => {
    const html = renderToStaticMarkup(<EventsTab {...context()} />);
    expect(card(html, "e2")).toContain('<small class="time-estimated" title="The witness gave no time; it was estimated from the order of the statement">Estimated Time</small>');
    expect(card(html, "e9")).not.toContain("time-estimated");
    expect(html).not.toContain("Time stated");
    expect(html.match(/Estimated Time/g)).toHaveLength(3);
  });

  test("the selected event box shows the label next to the time", () => {
    const ctx = context();
    const html = renderToStaticMarkup(
      <PanelHeader tabs={[]} activeTab="" onTab={() => {}} graph={ctx.graph} selectedEventId="e8" placeOf={() => null} timeBasisOf={ctx.timeBasisOf} onJump={() => {}} />,
    );
    expect(html).toMatch(/<span class="mono">[^<]+<\/span><small class="time-estimated"[^>]*>Estimated Time</);
    const stated = renderToStaticMarkup(
      <PanelHeader tabs={[]} activeTab="" onTab={() => {}} graph={ctx.graph} selectedEventId="e9" placeOf={() => null} timeBasisOf={ctx.timeBasisOf} onJump={() => {}} />,
    );
    expect(stated).not.toContain("time-estimated");
  });
});
