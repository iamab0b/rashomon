import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { gatedSnapshot } from "../scene/playback/graphSource";
import { useSceneStore } from "../scene/store";
import { HistoryPanel } from "./HistoryPanel";
import { RightPanel } from "./RightPanel";
import type { PanelContext } from "./shared";

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

describe("history panel", () => {
  test("History is a contextual control, not a fourth tab", () => {
    const html = renderToStaticMarkup(<RightPanel />);
    const tabs = [...html.matchAll(/role="tab"[^>]*>([A-Za-z]+)/g)].map((m) => m[1]);
    expect(tabs).toEqual(["Flags", "Events", "Witnesses"]);
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="history-panel"[^>]*>History<\/button>/);
    expect(html).toContain("e5 · ");
    expect(html).toMatch(/<aside id="history-panel"[^>]*aria-hidden="true"[^>]*inert=""/);
  });

  test("open panel shows the selected event's history with a close button", () => {
    const html = renderToStaticMarkup(<HistoryPanel open onClose={() => {}} context={context()} />);
    expect(html).toContain("data-open");
    expect(html).not.toContain("inert");
    expect(html).toContain('aria-label="Close history"');
    expect(html).toContain("e5 · witness");
    expect(html).toContain("10.0–12.0 s");
  });
});
