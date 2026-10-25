import robberyTranscript from "../../../../packages/extractor/fixtures/robbery.transcript.json";
import { robberyClerkSegment, robberyClerkWitness, robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import type { ResolvedEvent } from "../scene";
import type { GraphMode } from "./graphMode";
import { inDisplayOrder } from "./playback";

export type Utterance = { id: string; speaker: string; text: string; witnessId?: string };

const FIRST_WITNESS = robberyGraph.witnesses?.[0]?.id;

const FIXTURE_TRANSCRIPTS: Record<string, readonly Utterance[]> = {
  [storeScene.sceneId]: robberyTranscript.map((u) => (FIRST_WITNESS && u.speaker === "witness" ? { ...u, witnessId: FIRST_WITNESS } : u)),
};

const FIXTURE_EXTRA_STATEMENTS: Record<string, readonly { witnessId: string; utterances: readonly Utterance[] }[]> = {
  [storeScene.sceneId]: [
    {
      witnessId: robberyClerkWitness.id,
      utterances: robberyClerkSegment.utterances.map((u) => ({ id: u.id, speaker: robberyClerkSegment.speaker, text: u.text, witnessId: robberyClerkWitness.id })),
    },
  ],
};

export function transcriptFor(mode: GraphMode, sceneId: string, witnessIds: readonly string[] = []): readonly Utterance[] | null {
  if (mode !== "fixture") return null;
  const base = FIXTURE_TRANSCRIPTS[sceneId];
  if (!base) return null;
  const extra = (FIXTURE_EXTRA_STATEMENTS[sceneId] ?? []).filter((s) => witnessIds.includes(s.witnessId)).flatMap((s) => s.utterances);
  return extra.length > 0 ? [...base, ...extra] : base;
}

export function sourceNumber(id: string): string {
  return /(\d+)$/.exec(id)?.[1] ?? id;
}

export function sourceLabel(id: string): string {
  return `Source ${sourceNumber(id)}`;
}

export function speakerLabel(speaker: string | undefined): string {
  if (!speaker) return "Witness statement";
  return speaker.charAt(0).toUpperCase() + speaker.slice(1);
}

export function relatedUtterances(event: Pick<ResolvedEvent, "sources"> | null): ReadonlySet<string> {
  return new Set(event?.sources ?? []);
}

export function utteranceEvents<T extends Pick<ResolvedEvent, "id" | "tStart" | "tEnd" | "sources">>(
  events: readonly T[],
): ReadonlyMap<string, T[]> {
  const map = new Map<string, T[]>();
  for (const event of inDisplayOrder(events)) {
    for (const source of event.sources) map.set(source, [...(map.get(source) ?? []), event]);
  }
  return map;
}
