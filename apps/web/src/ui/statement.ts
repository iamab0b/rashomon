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
  resent: boolean | null;
  source: string;
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

const finished = new Map<string, StatementResult>();

export function sourceKey(mode: string, sceneId: string | undefined): string {
  return `${mode}:${sceneId ?? ""}`;
}

const resultKey = (source: string, segmentId: string) => `${source}|${segmentId}`;

export function rememberResult(source: string, segmentId: string, result: StatementResult): void {
  finished.set(resultKey(source, segmentId), result);
}

export function isResend(source: string, segmentId: string, statusBeforeSubmit: StatementStatus | null): boolean {
  return finished.has(resultKey(source, segmentId)) || (statusBeforeSubmit?.state === "done" && statusBeforeSubmit.patchCount !== undefined);
}

const NO_OUTCOME: StatementOutcome = { added: [], changed: [], props: [], flags: [] };

export function alreadyAddedResult(source: string, segmentId: string, status: StatementStatus | null): StatementResult {
  const saved = finished.get(resultKey(source, segmentId));
  if (saved) {
    const n = saved.outcome.added.length + saved.outcome.changed.length;
    return { ...saved, label: n > 0 ? `Already added: ${plural(n, "event")}` : `Already added: ${saved.label}` };
  }
  const count = status?.patchCount ?? 0;
  return {
    label: count > 0 ? `Already added: ${plural(count, "change")}` : "Already added: no events found",
    outcome: NO_OUTCOME,
  };
}

export function resultOf(
  baseline: GraphBaseline,
  status: StatementStatus | null,
  graph: ResolvedGraph | null,
  live = false,
): StatementResult | null {
  if (status?.state !== "done") return null;
  if (live && status.patchCount === undefined) return null;
  const notes = { ...(status.note ? { note: status.note } : {}), ...(status.error ? { error: status.error } : {}) };
  if (!status.patchCount) return { label: addedLabel(0, NO_OUTCOME), outcome: NO_OUTCOME, ...notes };
  const outcome = outcomeSince(baseline, graph);
  const advanced = (graph?.version ?? 0) > baseline.version;
  const changed = outcome.added.length + outcome.changed.length + outcome.props.length > 0;
  if (!advanced && (live || !changed)) return null;
  return { label: addedLabel(status.patchCount, outcome), outcome, ...notes };
}

export function statementView(
  run: StatementRun | null,
  status: StatementStatus | null,
  graph: ResolvedGraph | null,
  identity: string | null,
  slow: boolean,
  live = false,
): StatementView {
  if (!run) return { kind: "idle" };
  if (run.error) return isEditorRefusal(run.error) ? { kind: "refused", identity } : { kind: "failed", error: run.error };
  if (run.result) return { kind: "done", ...run.result };
  if (status?.state === "failed") return { kind: "failed", error: status.error ?? "Extraction failed." };
  if (run.segmentId && run.resent) return { kind: "done", ...alreadyAddedResult(run.source, run.segmentId, status) };
  const result = run.segmentId && run.resent === false ? resultOf(run.baseline, status, graph, live) : null;
  return result ? { kind: "done", ...result } : { kind: "extracting", sent: run.sent, slow };
}
