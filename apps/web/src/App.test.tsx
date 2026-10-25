import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { GraphView } from "./scene";

const state = vi.hoisted(() => ({
  toolsAvailable: false,
  graph: null as GraphView | null,
}));

vi.mock("./scene", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./scene")>();
  const SceneTools = () => <div data-scene-tools="">tools</div>;
  return {
    ...actual,
    useGraph: () => state.graph ?? { resolved: null, statuses: {}, graph: null },
    useSceneToolsAvailable: () => state.toolsAvailable,
    SceneTools,
    Timeline: () => null,
    Scene: ({ sceneToolsHosted = false }: { sceneToolsHosted?: boolean }) =>
      !sceneToolsHosted && state.toolsAvailable ? (
        <div data-scene-tools-overlay="">
          <SceneTools />
        </div>
      ) : null,
  };
});

const { App } = await import("./App");
const { selectSource } = await import("./scene");

function render(search: string): { overlay: boolean; railScene: boolean } {
  vi.stubGlobal("window", { location: { search } });
  const html = renderToStaticMarkup(<App />);
  return {
    overlay: html.includes("data-scene-tools-overlay"),
    railScene: /class="context-rail__button[^"]*"[^>]*>.*?<span>Scene<\/span>/.test(html),
  };
}

function withGraph(): GraphView {
  const snapshot = selectSource("")!.getSnapshot();
  return { resolved: snapshot.resolved, statuses: snapshot.statuses, graph: snapshot.graph ?? null } as GraphView;
}

afterEach(() => {
  vi.unstubAllGlobals();
  state.toolsAvailable = false;
  state.graph = null;
});

describe("scene tools handoff between the canvas and the Scene drawer", () => {
  test("graphless labeling (?edit=landmarks): the tools stay on the canvas, since no drawer is mounted", () => {
    state.toolsAvailable = true;
    expect(render("?edit=landmarks")).toEqual({ overlay: true, railScene: false });
  });

  test("with a resolved graph and a scan: the canvas overlay is gone and the Scene drawer offers the tools", () => {
    state.toolsAvailable = true;
    state.graph = withGraph();
    expect(render("?scene=/scans/zatec_room.glb")).toEqual({ overlay: false, railScene: true });
  });

  test("never both, never neither, while tools are available; neither when they aren't", () => {
    for (const graph of [null, withGraph()]) {
      state.graph = graph;
      state.toolsAvailable = true;
      const shown = render("");
      expect(Number(shown.overlay) + Number(shown.railScene)).toBe(1);
      state.toolsAvailable = false;
      expect(render("")).toEqual({ overlay: false, railScene: false });
    }
  });
});
