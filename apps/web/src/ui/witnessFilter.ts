import type { ResolvedEvent, WitnessLayer } from "../scene";
import type { Utterance } from "./transcript";

export type WitnessFilter = {
  layers: readonly WitnessLayer[];
  hidden: ReadonlySet<string>;
  toggle: (id: string) => void;
  only: (id: string) => void;
  showAll: () => void;
};

export const NO_WITNESS_FILTER: WitnessFilter = { layers: [], hidden: new Set(), toggle: () => {}, only: () => {}, showAll: () => {} };

export function isSolo({ layers, hidden }: Pick<WitnessFilter, "layers" | "hidden">, id: string): boolean {
  return layers.length > 1 && !hidden.has(id) && layers.every((layer) => layer.id === id || hidden.has(layer.id));
}

export function soloWitness(filter: Pick<WitnessFilter, "layers" | "hidden">): WitnessLayer | null {
  return filter.layers.find((layer) => isSolo(filter, layer.id)) ?? null;
}

export function toggleSolo(filter: WitnessFilter, id: string): void {
  if (isSolo(filter, id)) filter.showAll();
  else filter.only(id);
}

export function filterSummary(filter: Pick<WitnessFilter, "layers" | "hidden">): string | null {
  const shown = filter.layers.filter((layer) => !filter.hidden.has(layer.id));
  if (filter.hidden.size === 0) return null;
  if (shown.length === 0) return "All witnesses hidden";
  if (shown.length === 1) return `Showing ${shown[0]!.label} only`;
  return `${filter.hidden.size} of ${filter.layers.length} witnesses hidden`;
}

export function visibleEvents<T extends Pick<ResolvedEvent, "witnessId">>(events: readonly T[], hidden: ReadonlySet<string>): T[] {
  return events.filter((event) => !hidden.has(event.witnessId));
}

export function visibleUtterances(
  transcript: readonly Utterance[],
  events: readonly Pick<ResolvedEvent, "witnessId" | "sources">[],
  hidden: ReadonlySet<string>,
): Utterance[] {
  if (hidden.size === 0) return [...transcript];
  return transcript.filter((utterance) => {
    const citing = events.filter((event) => event.sources.includes(utterance.id));
    return citing.length === 0 || citing.some((event) => !hidden.has(event.witnessId));
  });
}
