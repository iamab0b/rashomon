import type { ResolvedEvent, WitnessLayer } from "../scene";
import { speakerLabel, type Utterance } from "./transcript";

export type WitnessFilter = {
  layers: readonly WitnessLayer[];
  hidden: ReadonlySet<string>;
  toggle: (id: string) => void;
  only: (id: string) => void;
  showAll: () => void;
};

export type ActorFocus = { actor: string | null; setActor: (actor: string | null) => void };

export const NO_ACTOR_FOCUS: ActorFocus = { actor: null, setActor: () => {} };

export function actorsWithEvents(graph: { actors: readonly { id: string }[]; events: readonly Pick<ResolvedEvent, "actor">[] }): string[] {
  return graph.actors.filter((actor) => graph.events.some((event) => event.actor === actor.id)).map((actor) => actor.id);
}

export function focusedActor(focus: ActorFocus, actorIds: readonly string[]): string | null {
  return focus.actor !== null && actorIds.includes(focus.actor) ? focus.actor : null;
}

export function matchesActor<T extends Pick<ResolvedEvent, "actor">>(events: readonly T[], actor: string | null): T[] {
  return actor === null ? [...events] : events.filter((event) => event.actor === actor);
}

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
  events: readonly Pick<ResolvedEvent, "witnessId" | "sources" | "actor">[],
  hidden: ReadonlySet<string>,
  actor: string | null = null,
  keep: string | null = null,
): Utterance[] {
  if (hidden.size === 0 && actor === null) return [...transcript];
  return transcript.filter((utterance) => {
    if (utterance.id === keep) return true;
    if (utterance.witnessId !== undefined && hidden.has(utterance.witnessId)) return false;
    const citing = events.filter((event) => event.sources.includes(utterance.id));
    if (actor !== null) return citing.some((event) => event.actor === actor && !hidden.has(event.witnessId));
    return citing.length === 0 || citing.some((event) => !hidden.has(event.witnessId));
  });
}

export function utteranceSpeaker(
  utterance: Utterance,
  events: readonly Pick<ResolvedEvent, "witnessId" | "sources">[],
  layers: readonly Pick<WitnessLayer, "id" | "label">[],
): string {
  const own = utterance.witnessId !== undefined ? layers.find((layer) => layer.id === utterance.witnessId) : undefined;
  if (own) return own.label;
  const witnesses = new Set(events.filter((event) => event.sources.includes(utterance.id)).map((event) => event.witnessId));
  const only = witnesses.size === 1 ? layers.find((layer) => layer.id === [...witnesses][0]) : undefined;
  return only ? only.label : speakerLabel(utterance.speaker);
}
