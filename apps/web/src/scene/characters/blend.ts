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
  readonly anchor: number;
  readonly rampIn: Span;
  readonly rampOut: Span;
  readonly suppressors: readonly number[];
};

export type IdleAnchor = {
  readonly from: number;
  readonly anchor: number;
};

export type ClipWindowSet = {
  readonly windows: readonly ClipWindow[];
  readonly conflicts: readonly (readonly string[])[];
  readonly idleAnchors: readonly IdleAnchor[];
};

export type ClipSample = {
  readonly clip: string;
  readonly time: number;
  readonly weight: number;
};

export type ClipDurationLookup = (clip: string) => number | undefined;

export type ClipTimeOverride = (window: ClipWindow, t: number, duration: number) => number | undefined;

export type ClipSampler = (
  set: ClipWindowSet,
  t: number,
  durationOf: ClipDurationLookup,
  timeOf?: ClipTimeOverride,
) => readonly ClipSample[];

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

type Shaped = Draft & { rampIn: Span; rampOut: Span; suppressors: number[] };

export const EMPTY_WINDOW_SET: ClipWindowSet = { windows: [], conflicts: [], idleAnchors: [] };

export type EventStatusLookup = (event: ResolvedEvent) => Status;

const OWN_STATUS: EventStatusLookup = (event) => event.status;

export function isPlayable(status: Status): boolean {
  return PLAYABLE_STATUSES.has(status);
}

function hasPositiveDuration(event: Pick<ResolvedEvent, "tStart" | "tEnd">): boolean {
  return event.tEnd > event.tStart;
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
  statusOf: EventStatusLookup,
): Draft[] {
  const playable = events.filter((event) => isPlayable(statusOf(event)) && hasPositiveDuration(event));
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

function rampInFor(draft: Draft, earlier: readonly Draft[]): Span {
  if (draft.start <= TIMELINE_START_S) return [draft.start, draft.start];
  const underneath = earlier.filter((other) => other.start <= draft.start && draft.start < other.end);
  const nested = underneath.some((other) => other.end >= draft.end);
  if (nested || underneath.length === 0) return centered(draft.start, draft.blendIn);
  return [draft.start, Math.max(...underneath.map((other) => other.end))];
}

function rampOutFor(draft: Draft, later: readonly Draft[]): Span {
  const coveredAtEnd = later.some((other) => other.start < draft.end && other.end >= draft.end);
  return coveredAtEnd ? [draft.end, draft.end] : centered(draft.end, draft.blendOut);
}

function shape(drafts: readonly Draft[]): Shaped[] {
  return drafts.map((draft, index) => {
    const earlier = drafts.slice(0, index);
    const later = drafts.slice(index + 1);
    const suppressors = later
      .map((other, offset) => ({ other, at: index + 1 + offset }))
      .filter(({ other }) => other.start < draft.end)
      .map(({ at }) => at);
    return { ...draft, rampIn: rampInFor(draft, earlier), rampOut: rampOutFor(draft, later), suppressors };
  });
}

function idleAnchorAt(anchors: readonly IdleAnchor[], t: number): number {
  let anchor = TIMELINE_START_S;
  for (const segment of anchors) {
    if (segment.from > t) break;
    anchor = segment.anchor;
  }
  return anchor;
}

function withAnchors(shaped: readonly Shaped[]): { windows: ClipWindow[]; idleAnchors: IdleAnchor[] } {
  const windows: ClipWindow[] = [];
  const idleAnchors: IdleAnchor[] = [];
  shaped.forEach((draft, index) => {
    const previous = windows[index - 1];
    const contiguous = previous !== undefined && previous.end >= draft.start - ADJACENT_EPSILON_S;
    const continuesClip = contiguous && previous.clip === draft.clip && previous.loop && draft.loop;
    const bridgedByIdle = draft.clip === IDLE_CLIP && draft.loop && !contiguous;
    const anchor = continuesClip
      ? previous.anchor
      : bridgedByIdle
        ? idleAnchorAt(sortedAnchors(idleAnchors), draft.start)
        : draft.start;
    windows.push({
      source: draft.source,
      clip: draft.clip,
      start: draft.start,
      end: draft.end,
      loop: draft.loop,
      anchor,
      rampIn: draft.rampIn,
      rampOut: draft.rampOut,
      suppressors: draft.suppressors,
    });
    const continuesIdle = draft.clip === IDLE_CLIP && draft.loop;
    idleAnchors.push(
      continuesIdle
        ? { from: draft.rampIn[0], anchor }
        : { from: draft.rampOut[0], anchor: draft.rampOut[0] },
    );
  });
  return { windows, idleAnchors: sortedAnchors(idleAnchors) };
}

function sortedAnchors(anchors: readonly IdleAnchor[]): IdleAnchor[] {
  return anchors
    .map((segment, order) => ({ segment, order }))
    .sort((a, b) => a.segment.from - b.segment.from || a.order - b.order)
    .map(({ segment }) => segment);
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
  statusOf: EventStatusLookup = OWN_STATUS,
): ClipWindowSet {
  const drafts = withHandoffs(withHolds(draftsFor(actorId, events, hasClip, statusOf)));
  const { windows, idleAnchors } = withAnchors(shape(drafts));
  return { windows, conflicts: findConflicts(windows), idleAnchors };
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

export function envelope(window: Pick<ClipWindow, "rampIn" | "rampOut">, t: number): number {
  return Math.min(rampUp(t, window.rampIn), rampDown(t, window.rampOut));
}

export function clipTime(
  window: Pick<ClipWindow, "start" | "loop"> & { anchor?: number },
  t: number,
  duration: number,
): number {
  if (window.loop) {
    const elapsed = t - (window.anchor ?? window.start);
    return ((elapsed % duration) + duration) % duration;
  }
  return Math.min(Math.max(t - window.start, 0), duration);
}

type MutableSample = { clip: string; time: number; weight: number; dominant: number };

export function createClipSampler(): ClipSampler {
  const pool: MutableSample[] = [];
  const result: MutableSample[] = [];
  const envelopes: number[] = [];

  const emit = (clip: string, time: number, weight: number): void => {
    for (const existing of result) {
      if (existing.clip !== clip) continue;
      if (weight > existing.dominant) {
        existing.time = time;
        existing.dominant = weight;
      }
      existing.weight += weight;
      return;
    }
    const slot = pool[result.length] ?? { clip, time, weight, dominant: weight };
    pool[result.length] = slot;
    slot.clip = clip;
    slot.time = time;
    slot.weight = weight;
    slot.dominant = weight;
    result.push(slot);
  };

  const latestActive = (windows: readonly ClipWindow[], t: number): ClipWindow | null => {
    let count = 0;
    let latest: ClipWindow | null = null;
    for (const window of windows) {
      if (window.start > t || t >= window.end) continue;
      count += 1;
      if (!latest || window.start >= latest.start) latest = window;
    }
    return count > MAX_BLENDED_WINDOWS ? latest : null;
  };

  return (set, t, durationOf, timeOf) => {
    result.length = 0;
    const windowTime = (window: ClipWindow, duration: number): number =>
      timeOf?.(window, t, duration) ?? clipTime(window, t, duration);
    const { windows } = set;
    const override = latestActive(windows, t);
    if (override) {
      const duration = durationOf(override.clip);
      if (duration) emit(override.clip, windowTime(override, duration), 1);
    } else {
      envelopes.length = windows.length;
      windows.forEach((window, index) => {
        envelopes[index] = envelope(window, t);
      });
      windows.forEach((window, index) => {
        let weight = envelopes[index] ?? 0;
        for (const above of window.suppressors) weight *= 1 - (envelopes[above] ?? 0);
        if (weight <= 0) return;
        const duration = durationOf(window.clip);
        if (duration) emit(window.clip, windowTime(window, duration), weight);
      });
    }
    let total = 0;
    for (const sample of result) total += sample.weight;
    const idleDuration = durationOf(IDLE_CLIP);
    if (total < 1 && idleDuration) {
      const anchor = idleAnchorAt(set.idleAnchors, t);
      emit(IDLE_CLIP, clipTime({ start: anchor, loop: true, anchor }, t, idleDuration), 1 - total);
      total = 1;
    }
    if (total > 1) for (const sample of result) sample.weight /= total;
    return result;
  };
}

export function sampleClips(set: ClipWindowSet, t: number, durationOf: ClipDurationLookup): ClipSample[] {
  return createClipSampler()(set, t, durationOf).map(({ clip, time, weight }) => ({ clip, time, weight }));
}
