import robberyTranscript from "../../../../packages/extractor/fixtures/robbery.transcript.json";
import { storeScene } from "@rashomon/schema/fixtures";
import type { GraphMode } from "./graphMode";

export type Utterance = { id: string; speaker: string; text: string };

const FIXTURE_TRANSCRIPTS: Record<string, readonly Utterance[]> = {
  [storeScene.sceneId]: robberyTranscript,
};

export function transcriptFor(mode: GraphMode, sceneId: string): readonly Utterance[] | null {
  return mode === "fixture" ? (FIXTURE_TRANSCRIPTS[sceneId] ?? null) : null;
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
