import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { selectSource, type ResolvedGraph, type WitnessLayer } from "../scene";
import { disagreements, witnessColor, WitnessesTabView, type WitnessesTabViewProps } from "./WitnessesTab";

function twoWitnesses(): ResolvedGraph {
  return selectSource("?scenario=two-witnesses")!.getSnapshot().resolved!;
}

function layersOf(graph: ResolvedGraph): WitnessLayer[] {
  const listed = graph.witnesses ?? [];
  const derived = [...new Set(graph.events.map((e) => e.witnessId))].filter((id) => !listed.some((w) => w.id === id)).map((id) => ({ id, label: id }));
  return [...listed, ...derived].map((w) => ({ ...w, eventCount: graph.events.filter((e) => e.witnessId === w.id).length }));
}

function props(graph: ResolvedGraph, overrides: Partial<WitnessesTabViewProps> = {}): WitnessesTabViewProps {
  return {
    graph,
    statusOf: (event) => event.status,
    placeOf: (event) => `place of ${event.id}`,
    jumpTo: () => {},
    layers: layersOf(graph),
    hidden: new Set(),
    onToggle: () => {},
    onOnly: () => {},
    onShowAll: () => {},
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

const text = (el: ReactElement<Record<string, unknown>>) => renderToStaticMarkup(el).replace(/<[^>]+>/g, "");

describe("witnesses tab", () => {
  test("lists the customer and the clerk with their own counts and layer colors", () => {
    const graph = twoWitnesses();
    const html = renderToStaticMarkup(<WitnessesTabView {...props(graph)} />);
    expect(html).toContain("2 statements in reconstruction");
    expect(html).toMatch(/data-witness-id="w1".*<strong>Customer<\/strong>.*<b class="mono">10<\/b> events.*<b class="mono has-flags">3<\/b> open flags/s);
    expect(html).toMatch(/data-witness-id="w2".*<strong>Clerk<\/strong>.*<b class="mono">1<\/b> event<.*<b class="mono has-flags">2<\/b> open flags/s);
    const layers = layersOf(graph);
    expect(witnessColor(layers, "w1")).toBe("#4f9dff");
    expect(witnessColor(layers, "w2")).toBe("#4cd6a0");
  });

  test("the eye toggles a layer, Only this keeps one, Show all is enabled once something is hidden", () => {
    const graph = twoWitnesses();
    const onToggle = vi.fn();
    const onOnly = vi.fn();
    const onShowAll = vi.fn();
    const tree = WitnessesTabView(props(graph, { onToggle, onOnly, onShowAll }));
    const buttons = findAll(tree, (el) => el.type === "button");
    const eyes = buttons.filter((b) => b.props["aria-pressed"] !== undefined);
    expect(eyes.map((b) => b.props["aria-label"])).toEqual(["Hide Customer's layer", "Hide Clerk's layer"]);
    (eyes[1]!.props.onClick as () => void)();
    expect(onToggle).toHaveBeenCalledWith("w2");
    const only = buttons.filter((b) => b.props.children === "Only this");
    (only[0]!.props.onClick as () => void)();
    expect(onOnly).toHaveBeenCalledWith("w1");
    const showAll = buttons.find((b) => b.props.children === "Show all layers")!;
    expect(showAll.props.disabled).toBe(true);

    const hidden = WitnessesTabView(props(graph, { hidden: new Set(["w2"]) }));
    const html = renderToStaticMarkup(hidden);
    expect(html).toContain("1 of 2 hidden");
    expect(html).toContain('class="witness-row is-hidden" data-witness-id="w2"');
    expect(html).toContain('aria-label="Show Clerk&#x27;s layer"');
    const hiddenButtons = findAll(hidden, (el) => el.type === "button");
    expect(hiddenButtons.find((b) => b.props.children === "Show all layers")!.props.disabled).toBe(false);
    expect(hiddenButtons.filter((b) => b.props.children === "Only this")[0]!.props.disabled).toBe(true);
  });

  test("cross-witness conflicts are still found once per pair, but are shown in Flags, not in this tab", () => {
    const graph = twoWitnesses();
    const pairs = disagreements({ graph });
    expect(pairs.map((p) => p.events.map((e) => e.id).sort())).toEqual([
      ["e11", "e6"],
      ["e11", "e7"],
    ]);
    const html = renderToStaticMarkup(<WitnessesTabView {...props(graph)} />);
    expect(html).not.toContain("Where they disagree");
    expect(html).not.toContain("witness-conflict");
  });

  test("one witness: no layer controls and no disagreement section", () => {
    const graph = selectSource("")!.getSnapshot().resolved!;
    const html = renderToStaticMarkup(<WitnessesTabView {...props(graph)} />);
    expect(html).toContain("1 statement in reconstruction");
    expect(html).toContain('data-witness-id="w1"');
    expect(html).not.toContain("Show all layers");
    expect(html).not.toContain("Only this");
    expect(html).not.toContain("Where they disagree");
  });
});
