import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { gatedSnapshot } from "../scene/playback/graphSource";
import { useSceneStore } from "../scene/store";
import { ContextDrawer } from "./ContextDrawer";
import { RightPanel } from "./RightPanel";
import type { PanelContext } from "./shared";
import { transcriptFor } from "./transcript";

const pristine = { ...useSceneStore.getInitialState() };
const hadWindow = "window" in globalThis;

beforeAll(() => {
  if (!hadWindow) Object.assign(globalThis, { window: { location: { search: "?fixture=store" } } });
  Object.assign(useSceneStore.getInitialState(), gatedSnapshot(robberyGraph, storeScene), { selectedEventId: "e5" });
});

afterAll(() => {
  Object.assign(useSceneStore.getInitialState(), pristine);
  if (!hadWindow) delete (globalThis as { window?: unknown }).window;
});

function context(): PanelContext {
  const { resolved } = gatedSnapshot(robberyGraph, storeScene);
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
    notify: () => {},
    transcript: null,
  };
}

const drawer = (view: "transcript" | "history" | null, ctx: PanelContext = context(), focus: string | null = null) =>
  renderToStaticMarkup(<ContextDrawer view={view} onOpen={() => {}} onClose={() => {}} context={ctx} focusSourceId={focus} />);

describe("context drawer", () => {
  test("Transcript and History live on a rail, not as main tabs; the context box navigates", () => {
    const html = renderToStaticMarkup(<RightPanel />);
    const tabs = [...html.matchAll(/role="tab"[^>]*>([A-Za-z]+)/g)].map((m) => m[1]);
    expect(tabs.slice(0, 3)).toEqual(["Flags", "Events", "Witnesses"]);
    const rail = [...html.matchAll(/class="context-rail__button"[^>]*aria-expanded="false"[^>]*>.*?<span>([A-Za-z]+)<\/span>/g)].map((m) => m[1]);
    expect(rail).toEqual(["Transcript", "History"]);
    expect(html).toMatch(/<div id="context-drawer" class="context-inner" inert=""/);
    expect(html).not.toContain("transcript-drawer");
    expect(html).toContain("Event 6 of 10");
    expect(html).toMatch(/aria-label="Previous event" title="Previous event"(?![^>]*disabled)/);
    expect(html).toMatch(/aria-label="Next event" title="Next event"(?![^>]*disabled)/);
  });

  test("tabs and the selected-event box sit in a fixed header; only tab content scrolls", () => {
    const html = renderToStaticMarkup(<RightPanel />);
    const head = html.slice(html.indexOf('class="panel-head"'), html.indexOf('class="panel-scroll"'));
    expect(head).toContain('role="tablist"');
    expect(head).toContain('class="selection-bar"');
    expect(head).toMatch(/class="selection-meta"><span class="mono">10\.0–12\.0 s<\/span>/);
    expect(head).not.toContain('role="tabpanel"');
    expect(html.slice(html.indexOf('class="panel-scroll"'))).toMatch(/^class="panel-scroll"><div class="tab-panel" role="tabpanel"/);
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

  test("empty states keep the rail", () => {
    const none = { ...context(), selectedEventId: null };
    expect(drawer("history", none)).toContain("Select an event");
    expect(drawer("transcript", none)).toContain("Not connected");
    expect(drawer(null, none)).toContain("context-rail__button");
  });
});
