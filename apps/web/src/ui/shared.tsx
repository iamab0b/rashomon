import type { Override } from "@rashomon/schema";
import { Fragment, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { Flag, ResolvedEvent, ResolvedGraph, Status } from "../scene";
import { BASIS_LABELS, checkBasis, flagHeadline } from "./flagCopy";
import { Icon } from "./Icon";
import { placeName } from "./places";
import { sourceNumber, type Utterance } from "./transcript";

const STATUS_LABELS: Record<Status, string> = {
  plausible: "Plausible",
  proposed: "Checking…",
  implausible: "Implausible",
  overridden: "Overridden",
  superseded: "Replaced by a later statement",
};

export type PanelContext = {
  graph: ResolvedGraph;
  statusOf: (event: ResolvedEvent) => Status;
  pendingNoteOf: (event: ResolvedEvent) => string | null;
  isPending: (event: ResolvedEvent) => boolean;
  selectedEventId: string | null;
  playbackActive: ReadonlySet<string>;
  placeOf: (event: ResolvedEvent) => string | null;
  playing: boolean;
  jumpTo: (eventId: string) => void;
  openOverride: (eventId: string) => void;
  openSource: (sourceId: string) => void;
  openHistory: (eventId: string) => void;
  notify: (message: string) => void;
  transcript: readonly Utterance[] | null;
};

export function words(value: string): string {
  return value.replace(/_/g, " ");
}

export function actorLabel(graph: ResolvedGraph, actorId: string): string {
  return graph.actors.find((actor) => actor.id === actorId)?.label ?? actorId;
}

export function eventTitle(event: ResolvedEvent): string {
  return `${event.actor} · ${words(event.action)}`;
}

export function eventTime(event: ResolvedEvent): string {
  return `${event.tStart.toFixed(1)}–${event.tEnd.toFixed(1)} s`;
}

function propLabel(graph: ResolvedGraph, propId: string): string {
  return words(graph.props.find((prop) => prop.id === propId)?.type ?? propId);
}

const PROP_NAMES: Record<string, string> = { knife_chef: "chef’s knife" };

export function propName(graph: ResolvedGraph, propId: string): string {
  const type = graph.props.find((prop) => prop.id === propId)?.type ?? propId;
  return PROP_NAMES[type] ?? words(type);
}

export function eventTarget(graph: ResolvedGraph, event: ResolvedEvent): string | null {
  return event.target ? `Target: ${actorLabel(graph, event.target).toLowerCase()}` : null;
}

export function eventHolding(graph: ResolvedGraph, event: ResolvedEvent): string | null {
  return event.prop ? `Holding: ${propName(graph, event.prop)}` : null;
}

export function eventDetail(graph: ResolvedGraph, event: ResolvedEvent): string {
  const parts = [
    event.target && `target ${words(event.target)}`,
    event.prop && `with ${propLabel(graph, event.prop)}`,
  ];
  if (event.tInferred) parts.push("time inferred");
  return parts.filter(Boolean).join(" · ") || "no target or prop";
}

function formatEvidence(flag: Flag): string {
  return Object.entries(flag.evidence)
    .map(([key, value]) => `${key} ${typeof value === "number" ? Number(value.toFixed(2)) : value}`)
    .join(" · ");
}

export function activateOnKey(action: () => void) {
  return (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };
}

function stop(action: () => void) {
  return (e: MouseEvent) => {
    e.stopPropagation();
    action();
  };
}

export function StatusToken({ status, pending = false }: { status: Status; pending?: boolean }) {
  return (
    <span className={`status-token status-${status}`}>
      {status === "implausible" && <Icon name="warning" size={12} />}
      {status === "overridden" && <span className="status-diamond" />}
      {status === "proposed" && pending ? "Awaiting check" : STATUS_LABELS[status]}
    </span>
  );
}

export function SourceRefs({ sources, onOpen }: { sources: string[]; onOpen: (sourceId: string) => void }) {
  if (sources.length === 0) return <span className="source-refs">No source recorded</span>;
  return (
    <span className="source-refs">
      Witness statement · {sources.length === 1 ? "Source" : "Sources"}{" "}
      {sources.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && ", "}
          <button
            type="button"
            className="source-ref"
            title={`Show ${id} in the transcript`}
            aria-label={`Show source ${sourceNumber(id)} (${id}) in the transcript`}
            onClick={stop(() => onOpen(id))}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {sourceNumber(id)}
          </button>
        </Fragment>
      ))}
    </span>
  );
}

export function playbackMarkLabel(playing: boolean): string {
  return playing ? "Playing now" : "At the playhead";
}

export function PlaybackDot({ active, playing }: { active: boolean; playing: boolean }) {
  if (!active) return null;
  const label = playbackMarkLabel(playing);
  return <span className="playback-dot" role="img" aria-label={label} title={label} />;
}

export function SourceMeta({ sources, onOpen }: { sources: string[]; onOpen: (sourceId: string) => void }) {
  if (sources.length === 0) return <span className="source-meta">Sources: none recorded</span>;
  return (
    <span className="source-meta">
      Sources: Witness statement ·{" "}
      {sources.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && ", "}
          <button
            type="button"
            className="source-ref mono"
            title={`Show ${id} in the transcript`}
            aria-label={`Show ${id} in the transcript`}
            onClick={stop(() => onOpen(id))}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {id}
          </button>
        </Fragment>
      ))}
    </span>
  );
}

export function FlagCard({
  flag,
  sceneId,
  eventLabel,
  eventTimeLabel,
  selected,
  playbackActive,
  playing,
  onSelect,
  onOverride,
  onCopy,
}: {
  flag: Flag;
  sceneId: string;
  eventLabel: string;
  eventTimeLabel: string;
  selected: boolean;
  playbackActive: boolean;
  playing: boolean;
  onSelect: () => void;
  onOverride?: () => void;
  onCopy: (text: string) => void;
}) {
  return (
    <article
      className={`hard-flag${selected ? " selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`View ${eventLabel}, ${eventTimeLabel}, in the scene${playbackActive ? `, ${playbackMarkLabel(playing).toLowerCase()}` : ""}`}
      data-playback-active={playbackActive ? "true" : undefined}
      onClick={onSelect}
      onKeyDown={activateOnKey(onSelect)}
    >
      <div className="flag-event">
        <span className="flag-related">
          <span className="field-label">Related event</span>
          <span className="flag-related__event">
            {eventLabel} ·{" "}
            <span className="playback-when">
              <PlaybackDot active={playbackActive} playing={playing} />
              <time className="mono">{eventTimeLabel}</time>
            </span>
          </span>
        </span>
        <span className="view-in-scene" aria-hidden>
          <Icon name="eye" size={13} />
          View in scene
        </span>
      </div>
      <div className="hard-flag__heading">
        <div className="hard-flag__warning">
          <Icon name="warning" size={16} />
        </div>
        <div className="flag-chips">
          <span className="check-chip">{words(flag.check)}</span>
          <span className={`severity-chip${flag.severity === "soft" ? " soft" : ""}`}>{flag.severity}</span>
        </div>
      </div>
      <h3>{flagHeadline(flag, (id) => placeName(sceneId, id))}</h3>
      <span className="flag-basis">{BASIS_LABELS[checkBasis(flag.check)]}</span>
      <p className="hard-flag__detail">{flag.detail}</p>
      {Object.keys(flag.evidence).length > 0 && <div className="flag-evidence mono">{formatEvidence(flag)}</div>}
      <div className="suggested-question">
        <span className="field-label">Suggested question</span>
        <blockquote>“{flag.suggestedQuestion}”</blockquote>
        <button
          type="button"
          className="button button--small"
          onClick={stop(() => onCopy(flag.suggestedQuestion))}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Icon name="copy" size={13} />
          Copy
        </button>
      </div>
      {onOverride && (
        <div className="flag-actions">
          <button
            type="button"
            className="button"
            onClick={stop(onOverride)}
            onKeyDown={(e) => e.stopPropagation()}
          >
            Override…
          </button>
        </div>
      )}
    </article>
  );
}

export function OverrideLog({ override }: { override: Override }) {
  return (
    <div className="override-log">
      <div className="override-log__head">
        <span className="status-diamond" />
        <strong>Overridden by {override.by}</strong>
        <span className="decision-tag">Reason recorded</span>
      </div>
      <p>
        <span>Reason</span>“{override.reason}”
      </p>
      <p>
        <span>Time</span>
        <b className="mono">{new Date(override.at).toLocaleTimeString()}</b>
      </p>
    </div>
  );
}

export function PendingNote({ note }: { note: string | null }) {
  if (!note) return null;
  return (
    <div className="pending-note" role="status">
      <span className="status-diamond" />
      {note}
    </div>
  );
}

export function NotConnected({ children }: { children: ReactNode }) {
  return (
    <div className="not-connected">
      <strong>Not connected yet</strong>
      {children}
    </div>
  );
}
