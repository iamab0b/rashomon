import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { selectSource, type ResolvedGraph } from "../scene";
import { ContextDrawer, type ContextView } from "./ContextDrawer";
import type { PanelContext } from "./shared";
import { NO_ACTOR_FOCUS, NO_WITNESS_FILTER } from "./witnessFilter";

const tools = vi.hoisted(() => ({ available: false }));

vi.mock("../scene", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../scene")>()),
  useSceneToolsAvailable: () => tools.available,
  SceneTools: () => <div data-scene-tools-stub="">scan panel</div>,
}));

function context(graph: ResolvedGraph): PanelContext {
  return {
    graph,
    statusOf: (event) => event.status,
    pendingNoteOf: () => null,
    isPending: () => false,
    selectedEventId: null,
    playbackActive: new Set(),
    placeOf: () => null,
    timeBasisOf: () => "stated",
    witnessOf: () => null,
    actorColorOf: () => "#fff",
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

const drawer = (view: ContextView | null) =>
  renderToStaticMarkup(<ContextDrawer view={view} onOpen={() => {}} onClose={() => {}} context={context(selectSource("")!.getSnapshot().resolved!)} focusSourceId={null} />);

const railLabels = (html: string) => [...html.matchAll(/class="context-rail__button[^"]*"[^>]*>.*?<span>([A-Za-z ]+)<\/span>/g)].map((m) => m[1]);

describe("Scene rail item", () => {
  test("on the default URL the rail has no Scene item", () => {
    tools.available = false;
    expect(railLabels(drawer(null))).toEqual(["Transcript", "History", "Add statement"]);
  });

  test("with scene tools available, Scene sits above Add statement and opens a drawer with SceneTools", () => {
    tools.available = true;
    const closed = drawer(null);
    expect(railLabels(closed)).toEqual(["Transcript", "History", "Scene", "Add statement"]);
    expect(closed).toMatch(/class="context-rail__group context-rail__group--input context-rail__group--first-bottom" role="group" aria-label="Scene"/);
    expect(closed).toMatch(/class="context-rail__group context-rail__group--input" role="group" aria-label="Add source"/);
    const open = drawer("scene");
    expect(open).toContain('<h2 class="context-title">Scene</h2>');
    expect(open).toMatch(/<div role="region" aria-label="Scene"><div data-scene-tools-stub="">scan panel<\/div><\/div>/);
    expect(open).toMatch(/aria-expanded="true" aria-controls="context-drawer" title="Scene tools: scan and landmarks"/);
  });

  test("an open Scene view closes itself when the tools go away", () => {
    tools.available = false;
    const html = drawer("scene");
    expect(html).not.toContain("data-scene-tools-stub");
    expect(html).toMatch(/<aside class="rui context-column" aria-label="Context">/);
  });
});
