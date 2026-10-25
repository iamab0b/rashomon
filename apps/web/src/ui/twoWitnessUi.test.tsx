import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { selectSource, type ResolvedGraph, type WitnessLayer } from "../scene";
import { EventsTab } from "./EventsTab";
import { flagSides, FlagsTab } from "./FlagsTab";
import { chosenWitness, fixtureWitness, NEW_WITNESS, witnessToSend } from "./statement";
import { StatementSectionView, type StatementSectionViewProps } from "./StatementSection";
import type { PanelContext } from "./shared";
import { witnessColor, witnessTagOf } from "./witnesses";
import { WitnessStrip } from "./WitnessStrip";
import { NO_ACTOR_FOCUS, NO_WITNESS_FILTER } from "./witnessFilter";

function twoWitnesses(): ResolvedGraph {
  return selectSource("?scenario=two-witnesses")!.getSnapshot().resolved!;
}

function layersOf(graph: ResolvedGraph): WitnessLayer[] {
  const listed = graph.witnesses ?? [];
  const derived = [...new Set(graph.events.map((e) => e.witnessId))].filter((id) => !listed.some((w) => w.id === id)).map((id) => ({ id, label: id }));
  return [...listed, ...derived].map((w) => ({ ...w, eventCount: graph.events.filter((e) => e.witnessId === w.id).length }));
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
    placeOf: () => null,
    timeBasisOf: () => "stated",
    witnessOf: (event) => witnessTagOf(layers, event.witnessId),
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
    ...overrides,
  };
}

function findAll(node: ReactNode, matches: (el: ReactElement<Record<string, unknown>>) => boolean, out: ReactElement<Record<string, unknown>>[] = []) {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, matches, out);
    return out;
  }
  if (!isValidElement<Record<string, unknown>>(node)) return out;
  if (matches(node)) out.push(node);
  findAll(node.props.children as ReactNode, matches, out);
  return out;
}

const card = (html: string, id: string) => html.match(new RegExp(`data-event-id="${id}".*?event-id mono">${id}<`, "s"))![0];

describe("two-witness UI", () => {
  test("a witness tag exists only when there is more than one witness", () => {
    const layers = layersOf(twoWitnesses());
    expect(witnessTagOf(layers, "w2")).toEqual({ id: "w2", label: "Clerk", color: "#4cd6a0" });
    expect(witnessTagOf(layers.slice(0, 1), "w1")).toBeNull();
  });

  test("each event card names whose statement it came from", () => {
    const graph = twoWitnesses();
    const html = renderToStaticMarkup(<EventsTab {...context(graph)} />);
    expect(card(html, "e11")).toMatch(/Sources: <span class="witness-chip" data-witness-id="w2"><span class="witness-dot" style="background:#4cd6a0" aria-hidden="true"><\/span>Clerk’s statement<\/span>/);
    expect(card(html, "e3")).toContain("Customer’s statement");
    const single = selectSource("")!.getSnapshot().resolved!;
    const plain = renderToStaticMarkup(<EventsTab {...context(single, { witnessOf: () => null })} />);
    expect(plain).toContain("Sources: Witness statement");
    expect(plain).not.toContain("witness-chip");
  });

  test("a cross-witness contradiction flag names both witnesses; other flags don't", () => {
    const graph = twoWitnesses();
    const ctx = context(graph);
    const e7 = graph.events.find((e) => e.id === "e7")!;
    const sides = flagSides(ctx, e7, e7.flags.find((f) => f.check === "contradiction")!);
    expect(sides.map((s) => `${s.tag.label}:${s.eventId}`)).toEqual(["Customer:e7", "Clerk:e11"]);
    const e5 = graph.events.find((e) => e.id === "e5")!;
    expect(flagSides(ctx, e5, e5.flags[0]!)).toEqual([]);
    const html = renderToStaticMarkup(<FlagsTab {...ctx} />);
    expect(html).toMatch(/data-pair="e11\|e7".*Customer says.*e7.*Clerk says.*e11/s);
  });

  test("the Statement box picks an existing witness by id, or a new one by name", () => {
    const options = [
      { id: "w1", label: "Customer" },
      { id: "w2", label: "Clerk" },
    ];
    expect(chosenWitness(options, null)).toBe("w1");
    expect(chosenWitness(options, "w2")).toBe("w2");
    expect(chosenWitness(options, "gone")).toBe("w1");
    expect(chosenWitness(options, NEW_WITNESS)).toBe(NEW_WITNESS);
    expect(chosenWitness([], null)).toBe("Witness");
    expect(witnessToSend(options, "w2", "")).toBe("w2");
    expect(witnessToSend(options, NEW_WITNESS, "  Passer-by ")).toBe("Passer-by");
    expect(witnessToSend(options, NEW_WITNESS, "")).toBe("Witness");
    expect(witnessToSend([], "Witness", "Ana")).toBe("Ana");
  });

  test("the witness field is a dropdown of witnesses plus New witness…", () => {
    const base: StatementSectionViewProps = {
      graph: null,
      witness: "w2",
      witnesses: [
        { id: "w1", label: "Customer" },
        { id: "w2", label: "Clerk" },
      ],
      text: "",
      view: { kind: "idle" },
      voiceEnabled: false,
      onWitness: () => {},
      onText: () => {},
      onSubmit: () => {},
      onSelect: () => {},
      onCopyIdentity: () => {},
    };
    const html = renderToStaticMarkup(<StatementSectionView {...base} />);
    expect(html).toMatch(/<select><option value="w1">Customer<\/option><option value="w2" selected="">Clerk<\/option><option value="__new">New witness…<\/option><\/select>/);
    expect(html).not.toContain("New witness name");
    expect(renderToStaticMarkup(<StatementSectionView {...base} witness={NEW_WITNESS} />)).toContain("New witness name");
  });

  test("layer colors follow the scene's order, and the strip's buttons name their witness", () => {
    const graph = twoWitnesses();
    const layers = layersOf(graph);
    expect(witnessColor(layers, "w1")).toBe("#4f9dff");
    expect(witnessColor(layers, "w2")).toBe("#4cd6a0");
    const openStatement = vi.fn();
    const filter = { layers, hidden: new Set<string>(), toggle: vi.fn(), only: vi.fn(), showAll: vi.fn() };
    const html = renderToStaticMarkup(<WitnessStrip graph={graph} statusOf={(e) => e.status} openStatement={openStatement} filter={filter} />);
    expect(html).toContain('aria-label="Solo Clerk"');
    expect(html).toContain('aria-label="Re-interview Clerk"');
    const buttons = findAll(WitnessStrip({ graph, statusOf: (e) => e.status, openStatement, filter }), (el) => el.type === "button" && el.props["aria-label"] === "Re-interview Clerk");
    (buttons[0]!.props.onClick as () => void)();
    expect(openStatement).toHaveBeenCalledWith("w2");
  });

  test("fixture mode offers only the witness it can file statements under", () => {
    const options = [
      { id: "w1", label: "Customer" },
      { id: "w2", label: "Clerk" },
    ];
    expect(fixtureWitness(options, false)).toBe("w1");
    expect(fixtureWitness(options, true)).toBeNull();
    expect(chosenWitness(options, "w2", "w1")).toBe("w1");
    expect(chosenWitness(options, NEW_WITNESS, "w1")).toBe("w1");
    expect(chosenWitness(options, "w2", null)).toBe("w2");
    const view = (onlyWitness: string | null) =>
      renderToStaticMarkup(
        <StatementSectionView
          graph={null}
          witness="w1"
          witnesses={options}
          onlyWitness={onlyWitness}
          text=""
          view={{ kind: "idle" }}
          voiceEnabled={false}
          onWitness={() => {}}
          onText={() => {}}
          onSubmit={() => {}}
          onSelect={() => {}}
          onCopyIdentity={() => {}}
        />,
      );
    const fixture = view("w1");
    expect(fixture).toMatch(/<option value="w2" disabled="">Clerk<\/option><option value="__new" disabled="">New witness…<\/option>/);
    expect(fixture).toContain("Fixture data adds every statement to Customer.");
    const live = view(null);
    expect(live).not.toMatch(/<option[^>]*disabled/);
    expect(live).not.toContain("Fixture data adds");
  });
});
