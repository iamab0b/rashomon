import type { ResolvedEvent } from "@rashomon/engine";
import type { Status } from "@rashomon/schema";
import { ACTION_MAP, chooseClip, IDLE_CLIP } from "./actionMap";

export const TIMELINE_START_S = 0;
export const MAX_BLENDED_WINDOWS = 2;
const ADJACENT_EPSILON_S = 1e-6;

const PLAYABLE_STATUSES: ReadonlySet<Status> = new Set(["proposed", "plausible", "overridden"]);

export type Span = readonly [number, number];

export type ClipWindow = {
  readonly source: string;
  readonly clip: string;
  readonly start: number;
  readonly end: number;
  readonly loop: boolean;
  readonly rampIn: Span;
  readonly rampOut: Span;
};

export type ClipSample = {
  readonly clip: string;
  readonly time: number;
  readonly weight: number;
};

export type ClipWindowSet = {
  readonly windows: readonly ClipWindow[];
  readonly conflicts: readonly (readonly string[])[];
};

type Draft = {
  source: string;
  clip: string;
  start: number;
  end: number;
  loop: boolean;
  hold: boolean;
  blendIn: number;
  blendOut: number;
};

export function isPlayable(event: Pick<ResolvedEvent, "status">): boolean {
  return PLAYABLE_STATUSES.has(event.status);
}

function ownDraft(event: ResolvedEvent, hasClip: (name: string) => boolean): Draft {
  const spec = ACTION_MAP[event.action];
  return {
    source: event.id,
    clip: chooseClip(spec, hasClip),
    start: event.tStart,
    end: event.tEnd,
    loop: spec.loop,
    hold: spec.holdLastFrame,
    blendIn: spec.blendInS,
    blendOut: spec.blendOutS,
  };
}

function reactionDraft(event: ResolvedEvent): Draft | null {
  const spec = ACTION_MAP[event.action];
  const reaction = spec.targetReaction;
  if (!reaction) return null;
  return {
    source: `${event.id}:reaction`,
    clip: reaction.clip,
    start: event.tStart + reaction.delayS,
    end: event.tEnd + reaction.delayS,
    loop: false,
    hold: false,
    blendIn: spec.blendInS,
    blendOut: spec.blendOutS,
  };
}

function draftsFor(
  actorId: string,
  events: readonly ResolvedEvent[],
  hasClip: (name: string) => boolean,
): Draft[] {
  const playable = events.filter(isPlayable);
  const own = playable.filter((event) => event.actor === actorId).map((event) => ownDraft(event, hasClip));
  const reactions = playable
    .filter((event) => event.target === actorId && event.actor !== actorId)
    .map(reactionDraft)
    .filter((draft): draft is Draft => draft !== null);
  return [...own, ...reactions].sort((a, b) => a.start - b.start || a.source.localeCompare(b.source));
}

function withHolds(drafts: readonly Draft[]): Draft[] {
  return drafts.map((draft, index) => {
    if (!draft.hold) return draft;
    const next = drafts[index + 1];
    return { ...draft, end: next ? next.start : Number.POSITIVE_INFINITY };
  });
}

function withHandoffs(drafts: readonly Draft[]): Draft[] {
  return drafts.map((draft, index) => {
    const next = drafts[index + 1];
    const handsOff = next !== undefined && Math.abs(next.start - draft.end) <= ADJACENT_EPSILON_S;
    return handsOff ? { ...draft, end: next.start, blendOut: next.blendIn } : draft;
  });
}

function centered(at: number, width: number): Span {
  return [at - width / 2, at + width / 2];
}

function toWindow(draft: Draft, previous: Draft | undefined, next: Draft | undefined): ClipWindow {
  const overlapsPrevious = previous !== undefined && previous.end > draft.start;
  const overlapsNext = next !== undefined && next.start < draft.end;
  const rampIn: Span =
    draft.start <= TIMELINE_START_S
      ? [draft.start, draft.start]
      : overlapsPrevious
        ? [draft.start, Math.min(previous.end, draft.end)]
        : centered(draft.start, draft.blendIn);
  const rampOut: Span = overlapsNext
    ? [next.start, Math.min(draft.end, next.end)]
    : centered(draft.end, draft.blendOut);
  return {
    source: draft.source,
    clip: draft.clip,
    start: draft.start,
    end: draft.end,
    loop: draft.loop,
    rampIn,
    rampOut,
  };
}

function findConflicts(windows: readonly ClipWindow[]): string[][] {
  const conflicts: string[][] = [];
  for (const window of windows) {
    const active = windows.filter((other) => other.start <= window.start && window.start < other.end);
    if (active.length > MAX_BLENDED_WINDOWS) conflicts.push(active.map((other) => other.source));
  }
  return conflicts;
}

export function buildClipWindows(
  actorId: string,
  events: readonly ResolvedEvent[],
  hasClip: (name: string) => boolean,
): ClipWindowSet {
  const drafts = withHandoffs(withHolds(draftsFor(actorId, events, hasClip)));
  const windows = drafts.map((draft, index) => toWindow(draft, drafts[index - 1], drafts[index + 1]));
  return { windows, conflicts: findConflicts(windows) };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function rampUp(t: number, [from, to]: Span): number {
  if (to <= from) return t >= from ? 1 : 0;
  return clamp01((t - from) / (to - from));
}

function rampDown(t: number, [from, to]: Span): number {
  if (to <= from) return t < from ? 1 : 0;
  return clamp01((to - t) / (to - from));
}

export function envelope(window: ClipWindow, t: number): number {
  return Math.min(rampUp(t, window.rampIn), rampDown(t, window.rampOut));
}

export function clipTime(window: Pick<ClipWindow, "start" | "loop">, t: number, duration: number): number {
  const elapsed = t - window.start;
  if (window.loop) return ((elapsed % duration) + duration) % duration;
  return Math.min(Math.max(elapsed, 0), duration);
}

function contributions(windows: readonly ClipWindow[], t: number): { window: ClipWindow; weight: number }[] {
  const active = windows.filter((window) => window.start <= t && t < window.end);
  if (active.length > MAX_BLENDED_WINDOWS) {
    const latest = active.reduce((a, b) => (b.start >= a.start ? b : a));
    return [{ window: latest, weight: 1 }];
  }
  return windows
    .map((window) => ({ window, weight: envelope(window, t) }))
    .filter(({ weight }) => weight > 0);
}

function mergeByClip(samples: readonly ClipSample[]): ClipSample[] {
  const merged = new Map<string, { sample: ClipSample; total: number }>();
  for (const sample of samples) {
    const existing = merged.get(sample.clip);
    if (!existing) {
      merged.set(sample.clip, { sample, total: sample.weight });
      continue;
    }
    const dominant = sample.weight > existing.sample.weight ? sample : existing.sample;
    merged.set(sample.clip, { sample: dominant, total: existing.total + sample.weight });
  }
  return [...merged.values()].map(({ sample, total }) => ({ ...sample, weight: total }));
}

export function sampleClips(
  windows: readonly ClipWindow[],
  t: number,
  durationOf: (clip: string) => number | undefined,
): ClipSample[] {
  const weighted = contributions(windows, t).flatMap(({ window, weight }) => {
    const duration = durationOf(window.clip);
    if (!duration) return [];
    return [{ clip: window.clip, time: clipTime(window, t, duration), weight }];
  });
  const total = weighted.reduce((sum, sample) => sum + sample.weight, 0);
  const idleDuration = durationOf(IDLE_CLIP);
  const withIdle =
    total < 1 && idleDuration
      ? [...weighted, { clip: IDLE_CLIP, time: clipTime({ start: 0, loop: true }, t, idleDuration), weight: 1 - total }]
      : weighted;
  const merged = mergeByClip(withIdle);
  const sum = merged.reduce((acc, sample) => acc + sample.weight, 0);
  if (sum <= 1) return merged;
  return merged.map((sample) => ({ ...sample, weight: sample.weight / sum }));
}
