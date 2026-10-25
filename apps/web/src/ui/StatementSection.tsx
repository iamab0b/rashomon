import { useEffect, useState, type KeyboardEvent } from "react";
import { modeFromSearch, useGraphActions, useLiveIdentity, useStatementStatus, useWitnessLayers, type ResolvedEvent, type ResolvedGraph } from "../scene";
import { flagHeadline } from "./flagCopy";
import { placeName } from "./places";
import { actorLabel, StatusToken, words } from "./shared";
import {
  baselineOf,
  isResend,
  chosenWitness,
  NEW_WITNESS,
  noteStatementRejection,
  witnessToSend,
  rememberResult,
  resultOf,
  SLOW_AFTER_MS,
  statementView,
  voiceInterviewEnabled,
  type StatementRun,
  type StatementView,
  type WitnessOption,
} from "./statement";
import "./statement-section.css";

export type { StatementView } from "./statement";
export type CopyState = "idle" | "copied" | "manual";

export type StatementSectionViewProps = {
  graph: ResolvedGraph | null;
  witness: string;
  witnesses?: readonly WitnessOption[];
  newWitnessName?: string;
  onNewWitnessName?: (value: string) => void;
  text: string;
  view: StatementView;
  voiceEnabled: boolean;
  onWitness: (value: string) => void;
  onText: (value: string) => void;
  onSubmit: () => void;
  onSelect: (eventId: string) => void;
  onCopyIdentity: (identity: string) => void;
  copyState?: CopyState;
};

function isBusy(view: StatementView): boolean {
  return view.kind === "extracting";
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
  witnesses = [],
  newWitnessName = "",
  onNewWitnessName = () => {},
  text,
  view,
  voiceEnabled,
  onWitness,
  onText,
  onSubmit,
  onSelect,
  onCopyIdentity,
  copyState = "idle",
}: StatementSectionViewProps) {
  const canSubmit = text.trim().length > 0 && !isBusy(view);
  const stopKeys = (e: KeyboardEvent) => {
    if (e.key !== "Escape") e.stopPropagation();
  };

  return (
    <section className="statement-section" aria-label="Statement">
      <div className="section-title">
        <span className="eyebrow">Statement</span>
        <h2>Add what the witness said</h2>
      </div>

      {witnesses.length > 0 ? (
        <>
          <label className="statement-field">
            <span className="field-label">Witness</span>
            <select value={witness} onChange={(e) => onWitness(e.currentTarget.value)} onKeyDown={stopKeys}>
              {witnesses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
              <option value={NEW_WITNESS}>New witness…</option>
            </select>
          </label>
          {witness === NEW_WITNESS && (
            <label className="statement-field">
              <span className="field-label">New witness name</span>
              <input
                value={newWitnessName}
                placeholder="e.g. Passer-by"
                onChange={(e) => onNewWitnessName(e.currentTarget.value)}
                onKeyDown={stopKeys}
              />
            </label>
          )}
        </>
      ) : (
        <label className="statement-field">
          <span className="field-label">Witness</span>
          <input value={witness} onChange={(e) => onWitness(e.currentTarget.value)} onKeyDown={stopKeys} />
        </label>
      )}

      <label className="statement-field">
        <span className="field-label">Statement</span>
        <textarea
          value={text}
          className={view.kind === "extracting" ? "is-sent" : undefined}
          placeholder="Type or paste the witness's words"
          onChange={(e) => onText(e.currentTarget.value)}
          onKeyDown={(e) => {
            stopKeys(e);
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
            {view.note && <p className="statement-note">{view.note}</p>}
            {view.error && (
              <p className="statement-error" role="alert">
                {view.error}
              </p>
            )}
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
                  {copyState === "copied" ? "Copied" : "Copy"}
                </button>
              </div>
            )}
            {view.identity && copyState === "manual" && <p className="statement-note">Select and copy the identity above.</p>}
          </div>
        )}
      </div>
    </section>
  );
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function StatementSection({
  graph,
  onSelect,
  preferredWitness = null,
}: {
  graph: ResolvedGraph | null;
  onSelect: (eventId: string) => void;
  preferredWitness?: { id: string; nonce: number } | null;
}) {
  const { submitStatement: submit } = useGraphActions();
  const identity = useLiveIdentity();
  const { witnesses: layers } = useWitnessLayers();
  const witnesses: WitnessOption[] = layers.map((w) => ({ id: w.id, label: w.label }));
  const [choice, setChoice] = useState<string | null>(null);
  const [newWitnessName, setNewWitnessName] = useState("");
  const witness = chosenWitness(witnesses, choice);
  useEffect(() => {
    if (preferredWitness) setChoice(preferredWitness.id);
  }, [preferredWitness]);
  const [text, setText] = useState("");
  const [run, setRun] = useState<StatementRun | null>(null);
  const [slow, setSlow] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const status = useStatementStatus(run?.segmentId ?? null);
  const live = typeof window !== "undefined" && modeFromSearch(window.location.search) === "live";
  const view = statementView(run, status, graph, identity, slow, live);

  const firstStatus = run?.segmentId && run.resent === null ? status : null;
  useEffect(() => {
    if (!firstStatus || !run?.segmentId) return;
    const resent = isResend(run.segmentId, firstStatus);
    setRun((current) => (current && current.resent === null ? { ...current, resent } : current));
  }, [firstStatus, run?.segmentId]);

  const ready = run && !run.result && !run.error && run.segmentId && run.resent === false ? resultOf(run.baseline, status, graph, live) : null;
  useEffect(() => {
    if (!ready || !run?.segmentId) return;
    rememberResult(run.segmentId, ready);
    setRun((current) => (current && !current.result && current.segmentId === run.segmentId ? { ...current, result: ready } : current));
  }, [ready, run?.segmentId]);

  const extracting = view.kind === "extracting";
  useEffect(() => {
    setSlow(false);
    if (!extracting) return;
    const id = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [extracting, run?.sent]);

  const done = view.kind === "done";
  useEffect(() => {
    if (done && run) setText((current) => (current === run.sent ? "" : current));
  }, [done, run]);

  const onSubmit = () => {
    if (!text.trim() || extracting) return;
    const sent = text;
    const fresh: StatementRun = { sent, baseline: baselineOf(graph), segmentId: null, error: null, result: null, resent: null };
    setRun(fresh);
    setCopyState("idle");
    const fail = (err: unknown) => {
      const error = messageOf(err);
      noteStatementRejection(error);
      setRun((current) => (current === fresh || current?.sent === sent ? { ...fresh, error } : current));
    };
    try {
      submit(sent, witnessToSend(witnesses, witness, witnesses.length > 0 ? newWitnessName : witness)).then(
        ({ segmentId, baseVersion }) =>
          setRun((current) =>
            current?.sent === sent && !current.error ? { ...current, segmentId, baseline: { ...current.baseline, version: baseVersion } } : current,
          ),
        fail,
      );
    } catch (err) {
      fail(err);
    }
  };

  const onCopyIdentity = (value: string) => {
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard) return setCopyState("manual");
    clipboard.writeText(value).then(
      () => setCopyState("copied"),
      () => setCopyState("manual"),
    );
  };

  return (
    <StatementSectionView
      graph={graph}
      witness={witness}
      witnesses={witnesses}
      newWitnessName={newWitnessName}
      onNewWitnessName={setNewWitnessName}
      text={text}
      view={view}
      voiceEnabled={voiceInterviewEnabled(typeof window === "undefined" ? "" : window.location.search)}
      onWitness={setChoice}
      onText={setText}
      onSubmit={onSubmit}
      onSelect={onSelect}
      onCopyIdentity={onCopyIdentity}
      copyState={copyState}
    />
  );
}
