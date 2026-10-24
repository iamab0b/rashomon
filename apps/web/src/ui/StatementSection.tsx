import { useEffect, useState, type KeyboardEvent } from "react";
import type { ResolvedEvent, ResolvedGraph } from "../scene";
import { flagHeadline } from "./flagCopy";
import type { GraphMode } from "./graphMode";
import { placeName } from "./places";
import { actorLabel, StatusToken, words } from "./shared";
import {
  addedLabel,
  baselineOf,
  DEFAULT_WITNESS_NAME,
  isEditorRefusal,
  outcomeSince,
  SLOW_AFTER_MS,
  voiceInterviewEnabled,
  type GraphBaseline,
  type StatementOutcome,
} from "./statement";
import { useLiveIdentityOrNull, useStatementStatusOrNull, useSubmitStatement } from "./statementApi";
import "./statement-section.css";

export const FIXTURE_NOTE = "Fixture mode only understands the robbery's own statements.";
export const UNAVAILABLE_NOTE = "Statement input arrives with scene-core's submitStatement; it is not on main yet.";

export type StatementView =
  | { kind: "idle" }
  | { kind: "unavailable" }
  | { kind: "extracting"; sent: string; slow: boolean }
  | { kind: "done"; label: string; outcome: StatementOutcome; fixtureNote: boolean }
  | { kind: "failed"; error: string }
  | { kind: "refused"; identity: string | null };

export type StatementSectionViewProps = {
  graph: ResolvedGraph | null;
  witness: string;
  text: string;
  view: StatementView;
  voiceEnabled: boolean;
  onWitness: (value: string) => void;
  onText: (value: string) => void;
  onSubmit: () => void;
  onSelect: (eventId: string) => void;
  onCopyIdentity: (identity: string) => void;
};

function isBusy(view: StatementView): boolean {
  return view.kind === "extracting" || view.kind === "unavailable";
}

function EventRow({ graph, event, kind, onSelect }: { graph: ResolvedGraph | null; event: ResolvedEvent; kind: "new" | "changed"; onSelect: (id: string) => void }) {
  return (
    <li>
      <button type="button" className="statement-event" onClick={() => onSelect(event.id)}>
        <span className="statement-event__kind">{kind}</span>
        <span className="statement-event__what">
          {event.id} · {graph ? actorLabel(graph, event.actor) : event.actor} · {words(event.action)}
        </span>
        <StatusToken status={event.status} />
      </button>
    </li>
  );
}

export function StatementSectionView({
  graph,
  witness,
  text,
  view,
  voiceEnabled,
  onWitness,
  onText,
  onSubmit,
  onSelect,
  onCopyIdentity,
}: StatementSectionViewProps) {
  const canSubmit = text.trim().length > 0 && !isBusy(view);
  const stopKeys = (e: KeyboardEvent) => e.stopPropagation();

  return (
    <section className="statement-section" aria-label="Statement">
      <div className="section-title">
        <span className="eyebrow">Statement</span>
        <h2>Add what the witness said</h2>
      </div>

      <label className="statement-field">
        <span className="field-label">Witness</span>
        <input value={witness} onChange={(e) => onWitness(e.currentTarget.value)} onKeyDown={stopKeys} />
      </label>

      <label className="statement-field">
        <span className="field-label">Statement</span>
        <textarea
          value={text}
          className={view.kind === "extracting" ? "is-sent" : undefined}
          placeholder="Type or paste the witness's words"
          onChange={(e) => onText(e.currentTarget.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (canSubmit) onSubmit();
            }
          }}
        />
      </label>

      <div className="statement-actions">
        {voiceEnabled && (
          <button type="button" className="button button--quiet" title="Voice interview coming soon" aria-disabled="true">
            Start voice interview
          </button>
        )}
        <button type="button" className="button button--primary" disabled={!canSubmit} onClick={onSubmit} aria-keyshortcuts="Control+Enter Meta+Enter">
          Submit
        </button>
      </div>
      {voiceEnabled && <p className="statement-note">Voice interview coming soon.</p>}

      <div className="statement-status" aria-live="polite">
        {view.kind === "unavailable" && <p className="statement-note">{UNAVAILABLE_NOTE}</p>}
        {view.kind === "extracting" && (
          <div className="statement-progress">
            <p>
              <span className="statement-dot" aria-hidden />
              {view.slow ? "Still extracting — the model is slow" : "Extracting…"}
            </p>
            <blockquote className="statement-sent">{view.sent}</blockquote>
          </div>
        )}
        {view.kind === "done" && (
          <div className="statement-result">
            <p className="statement-result__label">{view.label}</p>
            {view.fixtureNote && <p className="statement-note">{FIXTURE_NOTE}</p>}
            {view.outcome.added.length + view.outcome.changed.length > 0 && (
              <ul className="statement-events">
                {view.outcome.added.map((event) => (
                  <EventRow key={event.id} graph={graph} event={event} kind="new" onSelect={onSelect} />
                ))}
                {view.outcome.changed.map((event) => (
                  <EventRow key={event.id} graph={graph} event={event} kind="changed" onSelect={onSelect} />
                ))}
              </ul>
            )}
            {view.outcome.flags.length > 0 && (
              <ul className="statement-flags">
                {view.outcome.flags.map((flag) => (
                  <li key={flag.id}>
                    <button type="button" className="statement-flag" onClick={() => onSelect(flag.eventId)}>
                      <span className={`severity-chip${flag.severity === "soft" ? " soft" : ""}`}>{flag.severity}</span>
                      <span>{flagHeadline(flag, (id) => placeName(graph?.sceneId ?? "", id))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {view.kind === "failed" && (
          <p className="statement-error" role="alert">
            {view.error}
          </p>
        )}
        {view.kind === "refused" && (
          <div className="statement-refused">
            <p>This browser can't add statements.</p>
            {view.identity && (
              <div className="statement-identity">
                <code>{view.identity}</code>
                <button type="button" className="button button--small" onClick={() => onCopyIdentity(view.identity!)}>
                  Copy
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

type Run = { sent: string; baseline: GraphBaseline; segmentId: string | null; error: string | null };

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function StatementSection({ graph, mode, onSelect }: { graph: ResolvedGraph | null; mode: GraphMode; onSelect: (eventId: string) => void }) {
  const submit = useSubmitStatement();
  const identity = useLiveIdentityOrNull();
  const [witness, setWitness] = useState(DEFAULT_WITNESS_NAME);
  const [text, setText] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [slow, setSlow] = useState(false);
  const status = useStatementStatusOrNull(run?.segmentId ?? "");

  const view: StatementView = (() => {
    if (!submit) return { kind: "unavailable" };
    if (!run) return { kind: "idle" };
    if (run.error) return isEditorRefusal(run.error) ? { kind: "refused", identity } : { kind: "failed", error: run.error };
    if (!run.segmentId || !status || status.state === "extracting") return { kind: "extracting", sent: run.sent, slow };
    if (status.state === "failed") return { kind: "failed", error: status.error ?? "Extraction failed." };
    const outcome = outcomeSince(run.baseline, graph);
    const label = addedLabel(status.patchCount, outcome);
    return { kind: "done", label, outcome, fixtureNote: mode === "fixture" && label.startsWith("No events") };
  })();

  const extracting = view.kind === "extracting";
  useEffect(() => {
    setSlow(false);
    if (!extracting) return;
    const id = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [extracting, run]);

  const done = view.kind === "done";
  useEffect(() => {
    if (done && run) setText((current) => (current === run.sent ? "" : current));
  }, [done, run]);

  const onSubmit = () => {
    if (!submit || !text.trim() || extracting) return;
    const sent = text;
    const fresh: Run = { sent, baseline: baselineOf(graph), segmentId: null, error: null };
    setRun(fresh);
    const fail = (err: unknown) => setRun((current) => (current === fresh || current?.sent === sent ? { ...fresh, error: messageOf(err) } : current));
    try {
      submit(sent, witness.trim() || DEFAULT_WITNESS_NAME).then(
        (result) => setRun((current) => (current?.sent === sent && !current.error ? { ...current, segmentId: result.segmentId } : current)),
        fail,
      );
    } catch (err) {
      fail(err);
    }
  };

  return (
    <StatementSectionView
      graph={graph}
      witness={witness}
      text={text}
      view={view}
      voiceEnabled={voiceInterviewEnabled(typeof window === "undefined" ? "" : window.location.search)}
      onWitness={setWitness}
      onText={setText}
      onSubmit={onSubmit}
      onSelect={onSelect}
      onCopyIdentity={(value) => void navigator.clipboard?.writeText(value).catch(() => {})}
    />
  );
}
