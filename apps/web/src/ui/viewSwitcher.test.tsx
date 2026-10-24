import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { gatedRobbery } from "./testGraph";
import { povWitnesses, povWitnessId, viewOptions, ViewSwitcherView, type ViewSwitcherViewProps } from "./ViewSwitcher";

const props = (overrides: Partial<ViewSwitcherViewProps> = {}): ViewSwitcherViewProps => {
  const witnesses = povWitnesses(gatedRobbery());
  return {
    preset: "overview",
    following: false,
    witnesses,
    witnessId: povWitnessId(witnesses, null),
    onPreset: vi.fn(),
    onTogglePov: vi.fn(),
    onWitness: vi.fn(),
    ...overrides,
  };
};

describe("view switcher", () => {
  test("Overview, Claimed sightline and POV; active follows camera state", () => {
    expect(viewOptions("overview", false)).toEqual([
      { id: "overview", label: "Overview", active: true },
      { id: "witness_claimed", label: "Claimed sightline", active: false },
      { id: "pov", label: "POV", active: false },
    ]);
    expect(viewOptions("witness_claimed", false).map((o) => o.active)).toEqual([false, true, false]);
    expect(viewOptions("witness_claimed", true).map((o) => o.active)).toEqual([false, false, true]);
    expect(viewOptions("counter_close", false).some((o) => o.active)).toBe(false);
  });

  test("witness options come from the graph's witness actors", () => {
    const graph = gatedRobbery();
    const witnesses = povWitnesses(graph);
    expect(witnesses.map((w) => w.id)).toEqual(graph.actors.filter((a) => a.role === "witness").map((a) => a.id));
    expect(witnesses.every((w) => w.hasPosition)).toBe(true);
    expect(povWitnessId(witnesses, null)).toBe(witnesses[0]!.id);
    expect(povWitnessId(witnesses, "unknown")).toBe(witnesses[0]!.id);
    expect(povWitnesses({ ...graph, events: [] })[0]!.hasPosition).toBe(false);
    expect(povWitnesses(null)).toEqual([]);
  });

  test("renders the buttons, pressed state and a labelled witness select", () => {
    const html = renderToStaticMarkup(<ViewSwitcherView {...props()} />);
    expect([...html.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((m) => m[1])).toEqual(["Overview", "Claimed sightline", "POV"]);
    expect(html).toMatch(/class="active" aria-pressed="true">Overview/);
    expect(html).toContain('aria-label="Select POV witness"');
    expect(html).not.toContain(POV_TEXT);
  });

  test("POV without a position shows a note instead of moving the camera", () => {
    const witnesses = povWitnesses({ ...gatedRobbery(), events: [] });
    const html = renderToStaticMarkup(<ViewSwitcherView {...props({ following: true, witnesses, witnessId: witnesses[0]!.id })} />);
    expect(html).toContain(POV_TEXT);
  });
});

const POV_TEXT = "POV position unavailable";
