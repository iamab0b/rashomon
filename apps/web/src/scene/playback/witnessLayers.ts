import type { ResolvedEvent, ResolvedGraph } from "@rashomon/engine";
import type { EventGraph, Witness } from "@rashomon/schema";
import { actorEvent, isDrawn, type ActorPlayback } from "./actorPose";

export const HIDDEN_WITNESS_OPACITY = 0.15;
export const LAYER_COLORS: readonly string[] = ["#4f9dff", "#4cd6a0", "#ff9f43", "#c58bff"];

export type WitnessLayer = { id: string; label: string; actorId?: string; eventCount: number };

export function witnessLayers(graph: Pick<EventGraph, "witnesses"> | null, resolved: ResolvedGraph | null): WitnessLayer[] {
  if (!resolved) return [];
  const counts = new Map<string, number>();
  for (const event of resolved.events) counts.set(event.witnessId, (counts.get(event.witnessId) ?? 0) + 1);
  const listed = graph?.witnesses ?? resolved.witnesses ?? [];
  const known = new Set(listed.map((w) => w.id));
  const derived: Witness[] = [...counts.keys()].filter((id) => !known.has(id)).map((id) => ({ id, label: id }));
  return [...listed, ...derived].map((w) => ({
    id: w.id,
    label: w.label,
    ...(w.actorId !== undefined ? { actorId: w.actorId } : {}),
    eventCount: counts.get(w.id) ?? 0,
  }));
}

export function layerColor(layers: readonly WitnessLayer[], witnessId: string): string {
  const index = layers.findIndex((layer) => layer.id === witnessId);
  return LAYER_COLORS[(index < 0 ? 0 : index) % LAYER_COLORS.length] ?? LAYER_COLORS[0]!;
}

export function isWitnessHidden(hidden: ReadonlySet<string>, event: Pick<ResolvedEvent, "witnessId">): boolean {
  return hidden.has(event.witnessId);
}

const covers = (event: Pick<ResolvedEvent, "tStart" | "tEnd">, t: number): boolean => t >= event.tStart && t <= event.tEnd;

const overlaps = (a: ResolvedEvent, b: ResolvedEvent): boolean => a.tStart < b.tEnd && b.tStart < a.tEnd;

export function disagreementEvents(resolved: ResolvedGraph, statusOf: (event: ResolvedEvent) => Parameters<typeof isDrawn>[0]): ResolvedEvent[] {
  const live = resolved.events.filter((event) => isDrawn(statusOf(event)));
  return live.filter((event) =>
    live.some((other) => other.id !== event.id && other.actor === event.actor && other.witnessId !== event.witnessId && overlaps(event, other)),
  );
}

export function markerShown(playback: ActorPlayback, event: ResolvedEvent, t: number): boolean {
  const chosen = actorEvent(playback, t);
  return (
    chosen !== undefined &&
    chosen.id !== event.id &&
    chosen.witnessId !== event.witnessId &&
    covers(event, t) &&
    covers(chosen, t)
  );
}
