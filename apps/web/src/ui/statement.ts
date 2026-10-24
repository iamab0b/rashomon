import type { Flag, ResolvedEvent, ResolvedGraph, StatementStatus } from "../scene";

export const DEFAULT_WITNESS_NAME = "Witness";
export const SLOW_AFTER_MS = 30_000;
export const VOICE_INTERVIEW_ENABLED = false;

type ResolvedProp = ResolvedGraph["props"][number];

export type GraphBaseline = {
  version: number;
  events: ReadonlyMap<string, string>;
  props: ReadonlyMap<string, string>;
  flags: ReadonlySet<string>;
};

export type StatementOutcome = {
  added: ResolvedEvent[];
  changed: ResolvedEvent[];
  props: ResolvedProp[];
  flags: Flag[];
};

export type StatementResult = { label: string; outcome: StatementOutcome; note?: string; error?: string };

export type StatementView =
  | { kind: "idle" }
  | { kind: "extracting"; sent: string; slow: boolean }
  | ({ kind: "done" } & StatementResult)
  | { kind: "failed"; error: string }
  | { kind: "refused"; identity: string | null };

export type StatementRun = {
  sent: string;
  baseline: GraphBaseline;
  segmentId: string | null;
  error: string | null;
  result: StatementResult | null;
};

function signature(event: ResolvedEvent): string {
  const { witnessId, actor, action, tStart, tEnd, tInferred, at, from, to, facing, target, prop, status, sources, supersededBy, override } = event;
  return JSON.stringify({ witnessId, actor, action, tStart, tEnd, tInferred, at, from, to, facing, target, prop, status, sources, supersededBy, override });
}

function propSignature(prop: ResolvedProp): string {
  const { type, position, heldBy, heldByIntervals, notes } = prop;
  return JSON.stringify({ type, position, heldBy, heldByIntervals, notes });
}

export function baselineOf(graph: ResolvedGraph | null, version = graph?.version ?? 0): GraphBaseline {
  const events = graph?.events ?? [];
  return {
    version,
    events: new Map(events.map((event) => [event.id, signature(event)])),
    props: new Map((graph?.props ?? []).map((prop) => [prop.id, propSignature(prop)])),
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
    props: (graph?.props ?? []).filter((prop) => baseline.props.get(prop.id) !== propSignature(prop)),
    flags: events.flatMap((event) => event.flags.filter((flag) => !baseline.flags.has(flag.id))),
  };
}

export function isEditorRefusal(message: string): boolean {
  return /\beditor/i.test(message);
}

// The Statement box shows its own rejections inline, so RightPanel skips the toast for them.
const shownInline = new Set<string>();

export function noteStatementRejection(message: string): void {
  shownInline.add(message);
}

export function isStatementRejection(message: string): boolean {
  return shownInline.has(message) || /^statement rejected\b/i.test(message) || isEditorRefusal(message);
}

export function voiceInterviewEnabled(search: string, constant = VOICE_INTERVIEW_ENABLED): boolean {
  return constant || new URLSearchParams(search).get("voice") === "1";
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

export function addedLabel(patchCount: number | undefined, outcome: StatementOutcome): string {
  const n = outcome.added.length + outcome.changed.length;
  if (n > 0) return `Added ${plural(n, "event")}`;
  const details = patchCount || outcome.props.length;
  if (details > 0) return `Updated ${plural(details, "detail")}`;
  return "No events found in that statement";
}

// The result is ready once extraction is done and, if it produced patches, the graph shows them: its
// version moved past the one the statement was sent against, or (the fixture keeps its version) it changed.
// In live mode the graph row can arrive after the status.
export function resultOf(baseline: GraphBaseline, status: StatementStatus | null, graph: ResolvedGraph | null): StatementResult | null {
  if (status?.state !== "done") return null;
  const outcome = outcomeSince(baseline, graph);
  const changed = outcome.added.length + outcome.changed.length + outcome.props.length > 0;
  if (status.patchCount && !changed && (graph?.version ?? 0) <= baseline.version) return null;
  return {
    label: addedLabel(status.patchCount, outcome),
    outcome,
    ...(status.note ? { note: status.note } : {}),
    ...(status.error ? { error: status.error } : {}),
  };
}

export function statementView(
  run: StatementRun | null,
  status: StatementStatus | null,
  graph: ResolvedGraph | null,
  identity: string | null,
  slow: boolean,
): StatementView {
  if (!run) return { kind: "idle" };
  if (run.error) return isEditorRefusal(run.error) ? { kind: "refused", identity } : { kind: "failed", error: run.error };
  if (run.result) return { kind: "done", ...run.result };
  if (status?.state === "failed") return { kind: "failed", error: status.error ?? "Extraction failed." };
  const result = run.segmentId ? resultOf(run.baseline, status, graph) : null;
  return result ? { kind: "done", ...result } : { kind: "extracting", sent: run.sent, slow };
}
