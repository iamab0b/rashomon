import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { actorColor, selectSource, type ResolvedGraph, type WitnessLayer } from "../scene";
import { ContextDrawer } from "./ContextDrawer";
import { EventsTab } from "./EventsTab";
import { FlagsTab, groupFlags } from "./FlagsTab";
import type { PanelContext } from "./shared";
import type { Utterance } from "./transcript";
import { filterSummary, isSolo, toggleSolo, visibleUtterances, type WitnessFilter } from "./witnessFilter";
import { witnessTagOf } from "./WitnessesTab";
import { WitnessStrip } from "./WitnessStrip";

const twoWitnesses = (): ResolvedGraph => selectSource("?scenario=two-witnesses")!.getSnapshot().resolved!;

function layersOf(graph: ResolvedGraph): WitnessLayer[] {
  const listed = graph.witnesses ?? [];
  const derived = [...new Set(graph.events.map((e) => e.witnessId))].filter((id) => !listed.some((w) => w.id === id)).map((id) => ({ id, label: id }));
  return [...listed, ...derived].map((w) => ({ ...w, eventCount: graph.events.filter((e) => e.witnessId === w.id).length }));
}

function filter(graph: ResolvedGraph, hidden: string[] = [], spies: Partial<WitnessFilter> = {}): WitnessFilter {
  return { layers: layersOf(graph), hidden: new Set(hidden), toggle: vi.fn(), only: vi.fn(), showAll: vi.fn(), ...spies };
}

function context(graph: ResolvedGraph, overrides: Partial<PanelContext> = {}): PanelContext {
  const layers = layersOf(graph);
  return {
    graph,
    statusOf: (event) => event.status,
    pendingNoteOf: () => null,
    isPending: () => false,
    selectedEventId: null,
    playbackActive: new Set(),
    placeOf: (event) => `place of ${event.id}`,
    timeBasisOf: () => "stated",
    witnessOf: (event) => witnessTagOf(layers, event.witnessId),
    actorColorOf: (id) => {
      const i = graph.actors.findIndex((a) => a.id === id);
      return actorColor(id, graph.actors[i]!.role, i);
    },
    witnessFilter: filter(graph),
    playing: false,
    jumpTo: () => {},
    openOverride: () => {},
    openSource: () => {},
    openHistory: () => {},
    openStatement: () => {},
    notify: () => {},
    transcript: null,
    ...overrides,
  };
}

function findAll(node: ReactNode, matches: (el: ReactElement<Record<string, unknown>>) => boolean, out: ReactElement<Record<string, unknown>>[] = []) {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, matches, out);
    return out;
  }
  if (!isValidElement<Record<string, unknown>>(node)) return out;
  if (typeof node.type === "function" && !matches(node)) return findAll((node.type as (p: unknown) => ReactNode)(node.props), matches, out);
  if (matches(node)) out.push(node);
  findAll(node.props.children as ReactNode, matches, out);
  return out;
}

describe("panel layout pass", () => {
  test("actor names use the timeline's actor colors, and the customer is purple, not blue", () => {
    expect(actorColor("witness", "witness", 0)).toBe("#c58bff");
    expect(actorColor("suspect", "suspect", 1)).toBe("#ff9f43");
    expect(actorColor("clerk", "clerk", 2)).toBe("#4cd6a0");
    const html = renderToStaticMarkup(<EventsTab {...context(twoWitnesses())} />);
    expect(html).toMatch(/<span class="event-actor" style="color:#c58bff">Witness \(customer\)<\/span>/);
    expect(html).toMatch(/<span class="event-actor" style="color:#ff9f43">Suspect<\/span>/);
    expect(html).not.toContain("color:#4f9dff");
  });

  test("Events filters by witness through the shared witness visibility, with All to go back", () => {
    const graph = twoWitnesses();
    const all = renderToStaticMarkup(<EventsTab {...context(graph)} />);
    expect(all).toMatch(/<button type="button" aria-pressed="true" class="active">All<\/button>/);
    expect(all).toContain("Chronological · 11 events");
    expect(all).not.toContain("Filtered:");

    const clerkOnly = renderToStaticMarkup(<EventsTab {...context(graph, { witnessFilter: filter(graph, ["w1"]) })} />);
    expect(clerkOnly).toContain("Chronological · 1 of 11 events");
    expect(clerkOnly.match(/data-event-id="/g)).toHaveLength(1);
    expect(clerkOnly).toContain('data-event-id="e11"');
    expect(clerkOnly).toContain("Filtered: Showing Clerk only");
    expect(clerkOnly).toMatch(/aria-pressed="true" class="active"><span class="witness-dot"[^>]*><\/span>Clerk/);

    const spies = filter(graph);
    const buttons = findAll(EventsTab(context(graph, { witnessFilter: spies })), (el) => el.type === "button" && el.props["aria-pressed"] !== undefined);
    (buttons[2]!.props.onClick as () => void)();
    expect(spies.only).toHaveBeenCalledWith("w2");
    (buttons[0]!.props.onClick as () => void)();
    expect(spies.showAll).toHaveBeenCalled();
  });

  test("solo, summaries and transcript hiding work on the same hidden set", () => {
    const graph = twoWitnesses();
    expect(isSolo(filter(graph, ["w1"]), "w2")).toBe(true);
    expect(isSolo(filter(graph), "w2")).toBe(false);
    expect(filterSummary(filter(graph, ["w2"]))).toBe("Showing Customer only");
    expect(filterSummary(filter(graph, ["w1", "w2"]))).toBe("All witnesses hidden");
    const solo = filter(graph, ["w1"]);
    toggleSolo(solo, "w2");
    expect(solo.showAll).toHaveBeenCalled();
    const none = filter(graph);
    toggleSolo(none, "w2");
    expect(none.only).toHaveBeenCalledWith("w2");

    const transcript: Utterance[] = [
      { id: "utt_1", speaker: "witness", text: "a" },
      { id: "utt_w2_2", speaker: "witness", text: "b" },
      { id: "utt_x", speaker: "investigator", text: "uncited" },
    ];
    expect(visibleUtterances(transcript, graph.events, new Set(["w2"])).map((u) => u.id)).toEqual(["utt_1", "utt_x"]);
    expect(visibleUtterances(transcript, graph.events, new Set(["w1"])).map((u) => u.id)).toEqual(["utt_w2_2", "utt_x"]);
  });

  test("the Witnesses strip shows each witness with eye, Solo and Re-interview", () => {
    const graph = twoWitnesses();
    const openStatement = vi.fn();
    const spies = filter(graph, ["w1"]);
    const strip = <WitnessStrip graph={graph} statusOf={(e) => e.status} openStatement={openStatement} filter={spies} />;
    const html = renderToStaticMarkup(strip);
    expect(html).toContain('aria-label="Witnesses"');
    expect(html).toContain("Showing Clerk only");
    expect(html).toMatch(/class="witness-card is-hidden" data-witness-id="w1"/);
    expect(html).toMatch(/class="witness-card is-solo" data-witness-id="w2"/);
    expect(html).toMatch(/aria-pressed="false" aria-label="Show Customer"[^>]*><svg[^>]*>.*?<path d="M3.5 3.5l13 13"/s);
    const tree = WitnessStrip({ graph, statusOf: (e) => e.status, openStatement, filter: spies });
    const buttons = findAll(tree, (el) => el.type === "button");
    (buttons.find((b) => b.props["aria-label"] === "Show Customer")!.props.onClick as () => void)();
    expect(spies.toggle).toHaveBeenCalledWith("w1");
    (buttons.filter((b) => b.props.children === "Solo")[1]!.props.onClick as () => void)();
    expect(spies.showAll).toHaveBeenCalled();
    (buttons.filter((b) => b.props.children === "Re-interview")[1]!.props.onClick as () => void)();
    expect(openStatement).toHaveBeenCalledWith("w2");
  });

  test("Flags are grouped by existing categories; each contradiction is one card with both linked events", () => {
    const graph = twoWitnesses();
    const ctx = context(graph);
    const flagged = graph.events.filter((e) => e.flags.length > 0);
    const groups = groupFlags(ctx, flagged);
    expect(groups.map((g) => g.category)).toEqual(["sightline", "contradiction"]);
    const contradiction = groups.find((g) => g.category === "contradiction")!;
    expect(contradiction.singles).toEqual([]);
    expect(contradiction.pairs.map((p) => p.key).sort()).toEqual(["e11|e6", "e11|e7"]);
    expect(contradiction.pairs.every((p) => p.b.flag !== null)).toBe(true);

    const html = renderToStaticMarkup(<FlagsTab {...ctx} />);
    expect([...html.matchAll(/class="flag-category__label">([A-Za-z ]+)</g)].map((m) => m[1])).toEqual(["Sightline", "Contradiction"]);
    expect(html.match(/class="contradiction-card"/g)).toHaveLength(2);
    expect(html).toMatch(/data-pair="e11\|e7".*class="contradiction-side__place is-different">place of e/s);
    expect(html).toMatch(/Ask Customer.*Ask Clerk/s);
    expect(html).toContain("Two accounts place suspect in different spots");
  });

  test("a contradiction without a linked event in the graph keeps the single flag card", () => {
    const graph = twoWitnesses();
    const events = graph.events.map((e) =>
      e.id === "e7" ? { ...e, flags: e.flags.map((f) => (f.check === "contradiction" ? { ...f, conflictsWith: ["missing"] } : f)) } : e,
    );
    const lonely = { ...graph, events: events.filter((e) => e.id !== "e11" && e.id !== "e6") };
    const groups = groupFlags({ graph: lonely }, lonely.events.filter((e) => e.flags.length > 0));
    const contradiction = groups.find((g) => g.category === "contradiction")!;
    expect(contradiction.pairs).toEqual([]);
    expect(contradiction.singles.map((s) => s.event.id)).toEqual(["e7"]);
  });

  test("the rail stays vertical and reachable while the drawer is open; its active item closes it", () => {
    const graph = twoWitnesses();
    const onClose = vi.fn();
    const onOpen = vi.fn();
    const html = renderToStaticMarkup(<ContextDrawer view="transcript" onOpen={onOpen} onClose={onClose} context={context(graph)} focusSourceId={null} />);
    expect(html).toMatch(/<div class="context-rail">.*Statement.*Transcript.*History.*<\/div><div id="context-drawer"/s);
    expect(html).not.toContain('tabindex="-1"');
    expect(html).not.toContain('role="tab"');
  });
});
