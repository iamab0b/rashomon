import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { actorColor, selectSource, type ResolvedEvent, type ResolvedGraph, type WitnessLayer } from "../scene";
import { ContextDrawer } from "./ContextDrawer";
import { EventsTab } from "./EventsTab";
import { FlagsTab, groupFlags } from "./FlagsTab";
import { PanelHeader } from "./PanelHeader";
import { flagEvidenceRows } from "./flagEvidence";
import { anchorsFor, eventPlace } from "./places";
import { robberyGraph } from "@rashomon/schema/fixtures";
import { displayLabel, type PanelContext } from "./shared";
import type { Utterance } from "./transcript";
import { actorsWithEvents, filterSummary, isSolo, NO_ACTOR_FOCUS, toggleSolo, utteranceSpeaker, visibleUtterances, type WitnessFilter } from "./witnessFilter";
import { witnessTagOf } from "./witnesses";
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
    actorFocus: NO_ACTOR_FOCUS,
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
  test("actor names use the timeline's actor colors, with Sahil's blue for the customer, shown as Customer", () => {
    expect(actorColor("witness", "witness", 0)).toBe("#4f9dff");
    expect(actorColor("suspect", "suspect", 1)).toBe("#ff9f43");
    expect(actorColor("clerk", "victim", 2)).toBe("#4cd6a0");
    expect(displayLabel("Witness (customer)")).toBe("Customer");
    expect(displayLabel("Clerk")).toBe("Clerk");
    const html = renderToStaticMarkup(<EventsTab {...context(twoWitnesses())} />);
    expect(html).toMatch(/<span class="event-actor" style="color:#4f9dff">Customer<\/span>/);
    expect(html).toMatch(/<span class="event-actor" style="color:#ff9f43">Suspect<\/span>/);
    expect(html).not.toContain("Witness (customer)");
  });

  test("Events filters by who acts, not by whose statement it is, and All goes back", () => {
    const graph = twoWitnesses();
    expect(actorsWithEvents(graph)).toEqual(["witness", "suspect", "clerk"]);
    const all = renderToStaticMarkup(<EventsTab {...context(graph)} />);
    expect(all).toMatch(/aria-label="Filter events by who acts"><button type="button" aria-pressed="true" class="active">All<\/button>/);
    expect(all).toContain("Chronological · 11 events");

    const clerkActs = renderToStaticMarkup(<EventsTab {...context(graph, { actorFocus: { actor: "clerk", setActor: () => {} } })} />);
    const shown = [...clerkActs.matchAll(/data-event-id="(e\d+)"/g)].map((m) => m[1]);
    expect(shown).toEqual(["e2", "e8"]);
    expect(graph.events.filter((e) => shown.includes(e.id)).every((e) => e.witnessId === "w1")).toBe(true);
    expect(shown).not.toContain("e11");
    expect(clerkActs).toContain("Chronological · 2 of 11 events");
    expect(clerkActs).not.toContain("Filtered:");
    expect(clerkActs).not.toContain("Show all");

    const setActor = vi.fn();
    const buttons = findAll(EventsTab(context(graph, { actorFocus: { actor: "clerk", setActor } })), (el) => el.type === "button" && el.props["aria-pressed"] !== undefined);
    (buttons[0]!.props.onClick as () => void)();
    expect(setActor).toHaveBeenLastCalledWith(null);
    (buttons[2]!.props.onClick as () => void)();
    expect(setActor).toHaveBeenLastCalledWith("suspect");
    (buttons[3]!.props.onClick as () => void)();
    expect(setActor).toHaveBeenLastCalledWith(null);
  });

  test("the actor filter keeps only that actor's cited transcript lines", () => {
    const graph = twoWitnesses();
    const transcript: Utterance[] = [
      { id: "utt_2", speaker: "witness", text: "suspect and clerk" },
      { id: "utt_5", speaker: "witness", text: "suspect only" },
      { id: "utt_x", speaker: "investigator", text: "uncited" },
    ];
    expect(visibleUtterances(transcript, graph.events, new Set(), "clerk").map((u) => u.id)).toEqual(["utt_2"]);
    expect(visibleUtterances(transcript, graph.events, new Set(), null).map((u) => u.id)).toEqual(["utt_2", "utt_5", "utt_x"]);
    expect(utteranceSpeaker(transcript[0]!, graph.events, layersOf(graph))).toBe("Customer");
    expect(utteranceSpeaker(transcript[2]!, graph.events, layersOf(graph))).toBe("Investigator");
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

  test("the Witnesses strip shows each witness with eye, Solo and Re-interview, without status text", () => {
    const graph = twoWitnesses();
    const openStatement = vi.fn();
    const spies = filter(graph, ["w1"]);
    const html = renderToStaticMarkup(<WitnessStrip graph={graph} statusOf={(e) => e.status} openStatement={openStatement} filter={spies} />);
    expect(html).toContain('aria-label="Witnesses"');
    expect(html).not.toContain(">Showing");
    expect(html).toMatch(/<button type="button" class="button button--small" title="Show every witness again">Show all<\/button>/);
    const allShown = renderToStaticMarkup(<WitnessStrip graph={graph} statusOf={(e) => e.status} openStatement={openStatement} filter={filter(graph)} />);
    expect(allShown).toMatch(/<button type="button" class="button button--small" disabled="" title="All witnesses are visible">Show all<\/button>/);
    expect(html).toMatch(/<strong>Customer<\/strong><\/div>/);
    expect(html).toMatch(/class="witness-card is-hidden" data-witness-id="w1"/);
    expect(html).toMatch(/class="witness-card is-solo" data-witness-id="w2"/);
    expect(html).toMatch(/aria-pressed="false" aria-label="Show Customer"[^>]*><svg[^>]*>.*?<path d="M3.5 3.5l13 13"/s);
    const tree = WitnessStrip({ graph, statusOf: (e) => e.status, openStatement, filter: spies });
    const buttons = findAll(tree, (el) => el.type === "button");
    (buttons.find((b) => b.props.children === "Show all")!.props.onClick as () => void)();
    expect(spies.showAll).toHaveBeenCalledTimes(1);
    (buttons.find((b) => b.props["aria-label"] === "Show Customer")!.props.onClick as () => void)();
    expect(spies.toggle).toHaveBeenCalledWith("w1");
    (buttons.filter((b) => b.props.children === "Solo")[1]!.props.onClick as () => void)();
    expect(spies.showAll).toHaveBeenCalledTimes(2);
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
    expect(html).toMatch(/<div class="context-rail">.*Transcript.*History.*Add statement.*<\/div><\/div><div id="context-drawer"/s);
    expect(html).not.toContain('tabindex="-1"');
    expect(html).not.toContain('role="tab"');
  });

  test("flag cards show places instead of coordinates, keeping the raw evidence collapsed", () => {
    const graph = selectSource("?scenario=two-witnesses")!.getSnapshot().resolved!;
    const placeOf = (event: ResolvedEvent) => eventPlace(graph.sceneId, event.action, anchorsFor(robberyGraph, event));
    const e5 = graph.events.find((e) => e.id === "e5")!;
    const sightline = e5.flags.find((f) => f.check === "sightline")!;
    expect(sightline.detail).toMatch(/\(\d+\.\d, \d+\.\d\)/);
    const rows = flagEvidenceRows(graph, e5, sightline, placeOf);
    expect(rows.filter((r) => !r.raw).map((r) => `${r.label}: ${r.value}`)).toEqual([
      "Sightline: From chips aisle to the suspect",
      "Blocked by: Chips shelf",
      "Where: 1.1 m along a 3.8 m line of sight",
      "When: 11.0 s",
    ]);
    expect(rows.filter((r) => !r.raw).every((r) => !/\(\d/.test(r.value))).toBe(true);
    const html = renderToStaticMarkup(<FlagsTab {...context(graph, { placeOf })} />);
    expect(html).toMatch(/<dt>Blocked by<\/dt><dd>Chips shelf<\/dd>/);
    expect(html).toMatch(/<details class="flag-raw"><summary>Raw evidence<\/summary><p class="hard-flag__detail">witness at \(/);
    const order = ["check-chip", "<h3>", "flag-basis", "flag-facts", "flag-related", "flag-raw", "suggested-question"].map((k) => html.indexOf(k, html.indexOf('class="hard-flag')));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("an event with no named place keeps its coordinates as a marked raw value", () => {
    const graph = twoWitnesses();
    const e5 = graph.events.find((e) => e.id === "e5")!;
    const rows = flagEvidenceRows(graph, e5, e5.flags[0]!, () => null);
    expect(rows[0]).toMatchObject({ label: "Sightline", raw: true });
    expect(rows[0]!.value).toMatch(/^From \(\d/);
  });

  test("the selected-event box shows on Events only", () => {
    const graph = twoWitnesses();
    const header = (showSelection: boolean) =>
      renderToStaticMarkup(
        <PanelHeader tabs={[]} activeTab="" onTab={() => {}} graph={graph} selectedEventId="e5" placeOf={() => null} onJump={() => {}} showSelection={showSelection} />,
      );
    expect(header(true)).toContain('aria-label="Selected event"');
    expect(header(false)).not.toContain('aria-label="Selected event"');
  });

  test("a requested transcript line stays visible even when the actor filter would hide it", () => {
    const graph = twoWitnesses();
    const transcript: Utterance[] = [
      { id: "utt_2", speaker: "witness", text: "suspect and clerk" },
      { id: "utt_6", speaker: "witness", text: "customer looks" },
    ];
    expect(visibleUtterances(transcript, graph.events, new Set(), "clerk").map((u) => u.id)).toEqual(["utt_2"]);
    expect(visibleUtterances(transcript, graph.events, new Set(), "clerk", "utt_6").map((u) => u.id)).toEqual(["utt_2", "utt_6"]);
  });

  test("sightline evidence names only the event's own place and the target, and shows the gate's sentence", () => {
    const graph = twoWitnesses();
    const e5 = graph.events.find((e) => e.id === "e5")!;
    const flag = e5.flags.find((f) => f.check === "sightline")!;
    const rows = flagEvidenceRows(graph, e5, flag, () => "From chips aisle");
    expect(rows[0]).toEqual({ label: "Sightline", value: "From chips aisle to the suspect" });
    expect(rows.find((r) => r.label === "Gate detail")).toEqual({ label: "Gate detail", value: flag.detail.charAt(0).toUpperCase() + flag.detail.slice(1), raw: true });
    expect(rows.map((r) => r.value).join(" ")).not.toMatch(/near counter/);
  });

  test("a paired contradiction card keeps the flag's detail and evidence under Raw evidence", () => {
    const html = renderToStaticMarkup(<FlagsTab {...context(twoWitnesses())} />);
    const card = html.slice(html.indexOf('class="contradiction-card"'));
    expect(card).toMatch(/<details class="flag-raw"><summary>Raw evidence<\/summary><p class="hard-flag__detail">suspect is placed by the/);
    expect(card).toMatch(/class="flag-evidence mono">distanceM/);
  });
});
