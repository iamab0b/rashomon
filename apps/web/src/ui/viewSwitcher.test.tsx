import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test } from "vitest";
import { applyViewKey } from "../scene";
import { gatedSnapshot } from "../scene/playback/graphSource";
import { useSceneStore } from "../scene/store";
import { povWitnesses, povWitnessId, viewOptions, ViewSwitcher } from "./ViewSwitcher";

const initial = useSceneStore.getState();
const pristine = { ...useSceneStore.getInitialState() };
const snap = () => gatedSnapshot(robberyGraph, storeScene);

afterEach(() => {
  useSceneStore.setState(initial, true);
  Object.assign(useSceneStore.getInitialState(), pristine);
});

describe("view switcher", () => {
  test("only Overview and POV, on the existing keys", () => {
    expect(viewOptions("overview", false)).toEqual([
      { key: "1", label: "Overview", active: true },
      { key: "2", label: "POV", active: false },
    ]);
    expect(viewOptions("overview", true).map((o) => o.active)).toEqual([false, true]);
    expect(viewOptions("counter_close", false).some((o) => o.active)).toBe(false);
  });

  test("clicking runs the same store transition as the key and keeps the POV witness", () => {
    applyViewKey("1");
    expect(useSceneStore.getState().preset).toBe("overview");
    useSceneStore.getState().setPovActor("w_custom");
    applyViewKey("2");
    expect(useSceneStore.getState().povFollow).toBe(true);
    expect(useSceneStore.getState().povActor).toBe("w_custom");
    applyViewKey("2");
    expect(useSceneStore.getState().povFollow).toBe(false);
    expect(applyViewKey("9")).toBe(false);
  });

  test("witness options come from the graph's witness actors", () => {
    const { resolved } = snap();
    const witnesses = povWitnesses(resolved);
    expect(witnesses.map((w) => w.id)).toEqual(resolved!.actors.filter((a) => a.role === "witness").map((a) => a.id));
    expect(witnesses.every((w) => w.hasPosition)).toBe(true);
    expect(povWitnessId(witnesses, null)).toBe(witnesses[0]!.id);
    expect(povWitnessId(witnesses, "unknown")).toBe(witnesses[0]!.id);
    expect(povWitnesses({ ...resolved!, events: [] })[0]!.hasPosition).toBe(false);
  });

  test("renders two buttons and a labelled witness select, no shortcut text", () => {
    Object.assign(useSceneStore.getInitialState(), snap(), { preset: "overview", povFollow: false });
    const html = renderToStaticMarkup(<ViewSwitcher />);
    expect([...html.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((m) => m[1])).toEqual(["Overview", "POV"]);
    expect(html).toMatch(/aria-pressed="true" aria-keyshortcuts="1" aria-label="Overview view"/);
    expect(html).not.toMatch(/<kbd|· ?[12]</);
    expect(html).toContain('aria-label="Select POV witness"');
    expect(html).not.toContain("POV position unavailable");
    Object.assign(useSceneStore.getInitialState(), { povFollow: true, resolved: { ...snap().resolved!, events: [] } });
    expect(renderToStaticMarkup(<ViewSwitcher />)).toContain("POV position unavailable");
  });
});
