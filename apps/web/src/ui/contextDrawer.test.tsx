import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ContextDrawer } from "./ContextDrawer";
import { PanelHeader } from "./PanelHeader";
import { StatusToken, type PanelContext } from "./shared";
import { gatedRobbery } from "./testGraph";
import { transcriptFor } from "./transcript";

function context(): PanelContext {
  const resolved = gatedRobbery();
  return {
    graph: resolved!,
    statusOf: (event) => event.status,
    pendingNoteOf: () => null,
    isPending: () => false,
    selectedEventId: "e5",
    playbackActive: new Set(),
    placeOf: () => null,
    playing: false,
    jumpTo: () => {},
    openOverride: () => {},
    openSource: () => {},
    openHistory: () => {},
    notify: () => {},
    transcript: null,
  };
}

const drawer = (view: "transcript" | "history" | null, ctx: PanelContext = context(), focus: string | null = null) =>
  renderToStaticMarkup(<ContextDrawer view={view} onOpen={() => {}} onClose={() => {}} context={ctx} focusSourceId={focus} />);

describe("context drawer", () => {
  const header = (selectedEventId: string | null) =>
    renderToStaticMarkup(
      <PanelHeader
        tabs={[
          { id: "flags", label: "Flags", count: 1 },
          { id: "events", label: "Events", count: 10 },
          { id: "witnesses", label: "Witnesses" },
        ]}
        activeTab="flags"
        onTab={() => {}}
        graph={gatedRobbery()}
        selectedEventId={selectedEventId}
        placeOf={() => "At chips aisle"}
        onJump={() => {}}
      />,
    );

  test("the fixed header holds the three main tabs and the selected-event box with prev/next", () => {
    const html = header("e5");
    expect([...html.matchAll(/role="tab"[^>]*>([A-Za-z]+)/g)].map((m) => m[1])).toEqual(["Flags", "Events", "Witnesses"]);
    expect(html).toContain('class="panel-head"');
    expect(html).toContain("Event 6 of 10");
    expect(html).toMatch(/class="selection-meta"><span class="mono">10\.0–12\.0 s<\/span> · At chips aisle/);
    expect(html).toMatch(/aria-label="Previous event" title="Previous event"(?![^>]*disabled)/);
    expect(html).toMatch(/aria-label="Next event" title="Next event"(?![^>]*disabled)/);
    expect(html).not.toContain("History");
  });

  test("prev is disabled on the first event, next on the last", () => {
    expect(header("e1")).toMatch(/aria-label="Previous event" title="Previous event" disabled=""/);
    expect(header("e10")).toMatch(/aria-label="Next event" title="Next event" disabled=""/);
    expect(header(null)).toContain("None selected");
  });

  test("Transcript and History sit on the drawer rail", () => {
    const html = drawer(null);
    const rail = [...html.matchAll(/class="context-rail__button"[^>]*aria-expanded="false"[^>]*>.*?<span>([A-Za-z]+)<\/span>/g)].map((m) => m[1]);
    expect(rail).toEqual(["Transcript", "History"]);
    expect(html).toMatch(/<div id="context-drawer" class="context-inner" inert=""/);
  });

  test("transcript view emphasises the selected event's utterances and links events", () => {
    const ctx = { ...context(), transcript: transcriptFor("fixture", "store_v1") };
    const e5 = ctx.graph.events.find((e) => e.id === "e5")!;
    const html = drawer("transcript", ctx, e5.sources[0] ?? null);
    expect(html).toContain("data-open");
    expect(html).not.toContain("inert");
    expect(html).toMatch(/role="tab" aria-selected="true" class="active">Transcript/);
    for (const id of e5.sources) {
      expect(html).toMatch(new RegExp(`data-utterance="${id}" class="related[^"]*" aria-current="true"`));
    }
    expect(html).toMatch(/class="event-chip mono selected" aria-pressed="true"[^>]*>e5</);
    expect((html.match(/class="related/g) ?? []).length).toBe(e5.sources.length);
  });

  test("history view lists versions newest first and marks superseded ones", () => {
    const base = context();
    const e5 = base.graph.events.find((e) => e.id === "e5")!;
    const earlier = { ...e5, id: "e5a", tStart: 8, tEnd: 9, supersededBy: "e5", status: "superseded" as const, flags: [] };
    const html = drawer("history", { ...base, graph: { ...base.graph, events: [...base.graph.events, earlier] } });
    expect(html).toMatch(/role="tab" aria-selected="true" class="active">History/);
    expect(html).toContain('aria-label="Close context panel"');
    expect(html.indexOf("Version 2 ")).toBeLessThan(html.indexOf("Version 1 "));
    expect(html).toMatch(/version-card--superseded/);
    expect(html).toContain("8.0–9.0 s → 10.0–12.0 s");
    expect(html).toContain("Replaced by e5");
  });

  test("an overridden selection tints the History rail and focuses its override entry", () => {
    const base = context();
    const override = { by: "investigator", reason: "Witness recalled the window view.", at: 0, flagIds: base.graph.events.find((e) => e.id === "e5")!.flags.map((f) => f.id) };
    const graph = { ...base.graph, events: base.graph.events.map((e) => (e.id === "e5" ? { ...e, status: "overridden" as const, override } : e)) };
    const ctx = { ...base, graph };
    const render = (accent: boolean, view: "history" | null, focus: string | null) =>
      renderToStaticMarkup(
        <ContextDrawer view={view} onOpen={() => {}} onClose={() => {}} context={ctx} focusSourceId={null} overrideFocusId={focus} historyAccent={accent} />,
      );
    expect(render(true, null, null)).toMatch(/class="context-rail__button has-override"[^>]*aria-description="Selected event has override history"/);
    expect(render(false, null, null)).not.toContain("has-override");
    const html = render(true, "history", "e5");
    expect(html).toContain("data-override-focus");
    expect(html).toContain("Witness recalled the window view.");
    expect(html).toMatch(/Before override<\/span> Implausible · sightline waived/);
    expect(render(true, "history", "e3")).not.toContain("data-override-focus");
  });

  test("a live proposed event waits with static text, not a spinner", () => {
    const html = renderToStaticMarkup(<StatusToken status="proposed" pending />);
    expect(html).toContain("Awaiting check");
    expect(html).not.toContain("spinner");
  });

  test("empty states keep the rail", () => {
    const none = { ...context(), selectedEventId: null };
    expect(drawer("history", none)).toContain("Select an event");
    expect(drawer("transcript", none)).toContain("Not connected");
    expect(drawer(null, none)).toContain("context-rail__button");
  });
});
