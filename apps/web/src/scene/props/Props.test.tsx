import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { gatedSnapshot } from "../playback/graphSource";
import { useSceneStore, type SceneState } from "../store";

vi.mock("./PropInstance", () => ({
  PropInstance: ({ prop, entry }: { prop: { id: string }; entry: { type: string } }) =>
    createElement("prop-instance", { "data-id": prop.id, "data-type": entry.type }),
}));

const { Props } = await import("./Props");

const initial = useSceneStore.getState();
const pristine = { ...useSceneStore.getInitialState() };

beforeEach(() => {
  useSceneStore.setState(initial, true);
});

function renderWith(patch: Partial<SceneState>): string {
  Object.assign(useSceneStore.getInitialState(), patch);
  try {
    return renderToStaticMarkup(createElement(Props, { manifest: storeScene }));
  } finally {
    Object.assign(useSceneStore.getInitialState(), pristine);
  }
}

describe("Props", () => {
  test("renders one instance per resolved prop on the fixture", () => {
    const { resolved, statuses, graph } = gatedSnapshot(robberyGraph, storeScene);
    const html = renderWith({ resolved, statuses, graph: graph ?? null });
    expect(html.match(/<prop-instance/g)).toHaveLength(2);
    expect(html).toContain('data-id="p_register"');
    expect(html).toContain('data-id="p_knife"');
    expect(html).toContain('data-type="knife_chef"');
  });

  test("renders nothing when there is no graph", () => {
    expect(renderWith({ resolved: null })).toBe("");
  });
});
