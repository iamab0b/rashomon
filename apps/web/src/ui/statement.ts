import type { Flag, ResolvedEvent, ResolvedGraph } from "../scene";

export const DEFAULT_WITNESS_NAME = "Witness";
export const SLOW_AFTER_MS = 30_000;
export const VOICE_INTERVIEW_ENABLED = false;

export type GraphBaseline = {
  events: ReadonlyMap<string, string>;
  flags: ReadonlySet<string>;
};

export type StatementOutcome = {
  added: ResolvedEvent[];
  changed: ResolvedEvent[];
  flags: Flag[];
};

function signature(event: ResolvedEvent): string {
  const { actor, action, tStart, tEnd, at, from, to, target, prop, status } = event;
  return JSON.stringify({ actor, action, tStart, tEnd, at, from, to, target, prop, status });
}

export function baselineOf(graph: ResolvedGraph | null): GraphBaseline {
  const events = graph?.events ?? [];
  return {
    events: new Map(events.map((event) => [event.id, signature(event)])),
    flags: new Set(events.flatMap((event) => event.flags.map((flag) => flag.id))),
  };
}

export function outcomeSince(baseline: GraphBaseline, graph: ResolvedGraph | null): StatementOutcome {
  const events = graph?.events ?? [];
  return {
    added: events.filter((event) => !baseline.events.has(event.id)),
    changed: events.filter((event) => {
      const before = baseline.events.get(event.id);
      return before !== undefined && before !== signature(event);
    }),
    flags: events.flatMap((event) => event.flags.filter((flag) => !baseline.flags.has(flag.id))),
  };
}

export function isEditorRefusal(message: string): boolean {
  return /\beditor/i.test(message);
}

export function voiceInterviewEnabled(search: string, constant = VOICE_INTERVIEW_ENABLED): boolean {
  return constant || new URLSearchParams(search).get("voice") === "1";
}

export function addedLabel(patchCount: number | undefined, outcome: StatementOutcome): string {
  const n = outcome.added.length + outcome.changed.length;
  if (n === 0 && !patchCount) return "No events found in that statement";
  return `Added ${n} ${n === 1 ? "event" : "events"}`;
}
