import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ContextDrawer } from "./ContextDrawer";
import { PanelHeader } from "./PanelHeader";
import { StatusToken, type PanelContext } from "./shared";
import type { Status } from "../scene";
import { MISSING_OVERRIDE_RECORD } from "./OverrideHistory";
import { gatedRobbery, OVERRIDE_REASON, overriddenRobbery } from "./testGraph";
import { transcriptFor } from "./transcript";
import { NO_ACTOR_FOCUS, NO_WITNESS_FILTER } from "./witnessFilter";

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
    timeBasisOf: () => "stated",
    witnessOf: () => null,
    actorColorOf: () => "#c58bff",
    witnessFilter: NO_WITNESS_FILTER,
    actorFocus: NO_ACTOR_FOCUS,
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

  test("the rail reviews first (Transcript, History), then a separate Add statement action", () => {
    const html = drawer(null);
    const rail = [...html.matchAll(/class="context-rail__button"[^>]*aria-expanded="false"[^>]*>.*?<span>([A-Za-z ]+)<\/span>/g)].map((m) => m[1]);
    expect(rail).toEqual(["Transcript", "History", "Add statement"]);
    expect(html).toMatch(/role="group" aria-label="Review">.*Transcript.*History.*<\/div><div class="context-rail__group context-rail__group--input" role="group" aria-label="Add source">.*Add statement/s);
    expect(html).toMatch(/aria-label="Add a witness statement"[^>]*title="Add a witness statement"/);
    expect(html).not.toMatch(/Testimony|Re-interview/);
    expect(html).toMatch(/<div id="context-drawer" class="context-inner" inert=""/);
  });

  test("the statement drawer is titled Add witness statement", () => {
    expect(renderToStaticMarkup(<ContextDrawer view="statement" onOpen={() => {}} onClose={() => {}} context={context()} focusSourceId={null} />)).toContain(
      '<h2 class="context-title">Add witness statement</h2>',
    );
  });

  test("transcript view emphasises the selected event's utterances and links events", () => {
    const ctx = { ...context(), transcript: transcriptFor("fixture", "store_v1") };
    const e5 = ctx.graph.events.find((e) => e.id === "e5")!;
    const html = drawer("transcript", ctx, e5.sources[0] ?? null);
    expect(html).toContain("data-open");
    expect(html).not.toContain("inert");
    expect(html).toMatch(/aria-expanded="true" aria-controls="context-drawer" title="Show transcript"/);
    expect(html).toContain('<h2 class="context-title">Transcript</h2>');
    expect(html).not.toContain('role="tab"');
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
    expect(html).toMatch(/aria-expanded="true" aria-controls="context-drawer" title="Show history"/);
    expect(html).toContain('<h2 class="context-title">History</h2>');
    expect(html).toContain('aria-label="Close context panel"');
    expect(html.indexOf("Version 2 ")).toBeLessThan(html.indexOf("Version 1 "));
    expect(html).toMatch(/version-card--superseded/);
    expect(html).toContain("8.0–9.0 s → 10.0–12.0 s");
    expect(html).toContain("Replaced by e5");
  });

  test("an overridden selection tints the History rail and focuses its override entry", () => {
    const ctx = { ...context(), graph: overriddenRobbery(), statusOf: (e: { status: Status }) => e.status };
    const render = (accent: boolean, view: "history" | null, focus: string | null) =>
      renderToStaticMarkup(
        <ContextDrawer view={view} onOpen={() => {}} onClose={() => {}} context={ctx} focusSourceId={null} overrideFocusId={focus} historyAccent={accent} />,
      );
    expect(render(true, null, null)).toMatch(/class="context-rail__button has-override"[^>]*aria-description="Selected event has override history"/);
    expect(render(false, null, null)).not.toContain("has-override");
    expect(render(true, "history", "e5")).toContain("data-override-focus");
    expect(render(true, "history", "e3")).not.toContain("data-override-focus");
  });

  test("an overridden event shows its original finding, the override and the current state, in that order", () => {
    const graph = overriddenRobbery();
    const e5 = graph.events.find((e) => e.id === "e5")!;
    expect(e5.status).toBe("overridden");
    const ctx = { ...context(), graph, statusOf: (e: { status: Status }) => e.status };
    const html = renderToStaticMarkup(
      <ContextDrawer view="history" onOpen={() => {}} onClose={() => {}} context={ctx} focusSourceId={null} overrideFocusId="e5" historyAccent />,
    );
    const original = html.indexOf("override-step--original");
    const action = html.indexOf("override-step--action");
    const current = html.indexOf("override-step--current");
    expect(original).toBeGreaterThan(-1);
    expect(original).toBeLessThan(action);
    expect(action).toBeLessThan(current);
    const originalStep = html.slice(original, action);
    expect(originalStep).toContain("status-token status-implausible");
    expect(originalStep).toContain("sightline is blocked by the chips shelf");
    expect(originalStep).toContain("blocker shelf_a");
    for (const id of e5.sources) expect(originalStep).toContain(id);
    const actionStep = html.slice(action, current);
    expect(actionStep).toContain("investigator");
    expect(actionStep).toContain(OVERRIDE_REASON);
    expect(actionStep).toMatch(/Previous<\/span>Implausible/);
    expect(html.slice(current)).toContain("status-token status-overridden");
    expect(html).not.toContain("no longer reports it");
  });

  test("missing history is stated, not invented", () => {
    const graph = overriddenRobbery();
    const stripped = { ...graph, events: graph.events.map((e) => (e.id === "e5" ? { ...e, flags: [] } : e)) };
    const html = renderToStaticMarkup(
      <ContextDrawer view="history" onOpen={() => {}} onClose={() => {}} context={{ ...context(), graph: stripped, statusOf: (e: { status: Status }) => e.status }} focusSourceId={null} />,
    );
    expect(html).toContain("sightline:e5</code> was recorded with the override, but the gate no longer reports it");
    expect(html).not.toContain("blocker shelf_a");
    const noRecord = { ...graph, events: graph.events.map((e) => (e.id === "e5" ? { ...e, override: undefined } : e)) };
    const bare = renderToStaticMarkup(
      <ContextDrawer view="history" onOpen={() => {}} onClose={() => {}} context={{ ...context(), graph: noRecord, statusOf: (e: { status: Status }) => e.status }} focusSourceId={null} />,
    );
    expect(bare).toContain(MISSING_OVERRIDE_RECORD);
    expect(bare).not.toContain("override-step--original");
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
