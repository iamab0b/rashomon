import type { ResolvedEvent, Status } from "../scene";

type Interval = Pick<ResolvedEvent, "id" | "tStart" | "tEnd">;

export function isPlaybackActive(event: Pick<ResolvedEvent, "tStart" | "tEnd">, t: number): boolean {
  return event.tStart <= t && t < event.tEnd;
}

export function playbackActiveIds(
  events: readonly ResolvedEvent[],
  t: number,
  statusOf: (event: ResolvedEvent) => Status,
): ReadonlySet<string> {
  return new Set(
    events.filter((event) => statusOf(event) !== "superseded" && isPlaybackActive(event, t)).map((event) => event.id),
  );
}

export function compareDisplayOrder(a: Interval, b: Interval): number {
  return a.tStart - b.tStart || a.tEnd - b.tEnd || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function inDisplayOrder<T extends Interval>(events: readonly T[]): T[] {
  return [...events].sort(compareDisplayOrder);
}

const SPACE_PASSTHROUGH =
  'input, textarea, select, button, a[href], summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="tab"], [role="dialog"]';

export type SpaceKeyLike = {
  key: string;
  repeat?: boolean;
  defaultPrevented?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target: EventTarget | { closest?: (selector: string) => unknown; isContentEditable?: boolean } | null;
};

export function spaceTogglesPlayback(event: SpaceKeyLike): boolean {
  if (event.key !== " " || event.defaultPrevented) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target as { closest?: (selector: string) => unknown; isContentEditable?: boolean } | null;
  if (target?.isContentEditable) return false;
  return !target?.closest?.(SPACE_PASSTHROUGH);
}
