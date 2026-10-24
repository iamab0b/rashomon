import type { Flag, ResolvedEvent } from "../scene";
import { compareDisplayOrder, inDisplayOrder } from "./playback";

type Linked = Pick<ResolvedEvent, "id" | "tStart" | "tEnd" | "supersededBy">;

export function versionChain<T extends Linked>(events: readonly T[], id: string): T[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  let newest = byId.get(id);
  if (!newest) return [];
  const walked = new Set([newest.id]);
  while (newest.supersededBy) {
    const next = byId.get(newest.supersededBy);
    if (!next || walked.has(next.id)) break;
    walked.add(next.id);
    newest = next;
  }
  const seen = new Set([newest.id]);
  const chain = [newest];
  for (let i = 0; i < chain.length; i += 1) {
    const current = chain[i]!;
    const older = events
      .filter((event) => event.supersededBy === current.id && !seen.has(event.id))
      .sort((a, b) => compareDisplayOrder(b, a));
    for (const event of older) {
      seen.add(event.id);
      chain.push(event);
    }
  }
  return chain;
}

export type FieldChange = { field: string; from: string; to: string };

export function versionChanges<T>(
  older: T,
  newer: T,
  describe: (event: T) => Readonly<Record<string, string>>,
): FieldChange[] {
  const before = describe(older);
  const after = describe(newer);
  return Object.keys({ ...before, ...after })
    .filter((field) => (before[field] ?? "") !== (after[field] ?? ""))
    .map((field) => ({ field, from: before[field] || "none", to: after[field] || "none" }));
}

export type Neighbors<T> = { index: number; total: number; prev: T | null; next: T | null };

export function eventNeighbors<T extends Pick<ResolvedEvent, "id" | "tStart" | "tEnd">>(
  events: readonly T[],
  selectedId: string | null,
): Neighbors<T> {
  const ordered = inDisplayOrder(events);
  const index = selectedId === null ? -1 : ordered.findIndex((event) => event.id === selectedId);
  if (index === -1) return { index: -1, total: ordered.length, prev: null, next: ordered[0] ?? null };
  return { index, total: ordered.length, prev: ordered[index - 1] ?? null, next: ordered[index + 1] ?? null };
}

export type OverrideTrail = {
  recorded: Flag[];
  missingFlagIds: string[];
  previousStatus: "implausible" | null;
};

export function overrideTrail(event: Pick<ResolvedEvent, "flags" | "override">): OverrideTrail | null {
  if (!event.override) return null;
  const ids = event.override.flagIds;
  const recorded = event.flags.filter((flag) => ids.includes(flag.id));
  return {
    recorded,
    missingFlagIds: ids.filter((id) => !recorded.some((flag) => flag.id === id)),
    previousStatus: ids.length > 0 ? "implausible" : null,
  };
}
