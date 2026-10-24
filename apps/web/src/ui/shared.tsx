import type { Override } from "@rashomon/schema";
import type { ReactNode } from "react";
import type { Flag, ResolvedEvent, ResolvedGraph, Status } from "../scene";
import { Icon } from "./Icon";

const STATUS_LABELS: Record<Status, string> = {
  plausible: "Plausible",
  proposed: "Checking…",
  implausible: "Implausible",
  overridden: "Overridden",
  superseded: "Replaced by a later statement",
};

const CHECK_TITLES: Record<Flag["check"], string> = {
  sightline: "The room blocks this sightline",
  reachability: "This place can't be reached",
  time_distance: "Too far to cover in that time",
  contradiction: "This contradicts another statement",
  unanchored: "No place given for this",
  missing_time: "No time given for this",
};

export type Overrides = Record<string, Override>;

export type PanelContext = {
  graph: ResolvedGraph;
  overrides: Overrides;
  statusOf: (event: ResolvedEvent) => Status;
  selectedEventId: string | null;
  jumpTo: (eventId: string) => void;
  openOverride: (eventId: string) => void;
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

export function StatusToken({ status }: { status: Status }) {
  return (
    <span className={`status-token status-${status}`}>
      {status === "implausible" && <Icon name="warning" size={12} />}
      {status === "overridden" && <span className="status-diamond" />}
      {STATUS_LABELS[status]}
    </span>
  );
}

export function FlagCard({
  flag,
  eventLabel,
  waived,
  onJump,
  onOverride,
}: {
  flag: Flag;
  eventLabel?: string;
  waived: boolean;
  onJump: () => void;
  onOverride?: () => void;
}) {
  return (
    <article className={`hard-flag${waived ? " is-waived" : ""}`}>
      {eventLabel && <span className="flag-event mono">{eventLabel}</span>}
      <div className="hard-flag__heading">
        <div className="hard-flag__warning">
          <Icon name="warning" size={16} />
        </div>
        <div className="flag-chips">
          <span className="check-chip">{words(flag.check)}</span>
          <span className={`severity-chip${flag.severity === "soft" ? " soft" : ""}`}>{flag.severity}</span>
        </div>
      </div>
      <h3>{CHECK_TITLES[flag.check]}</h3>
      <p className="hard-flag__detail">{flag.detail}</p>
      {Object.keys(flag.evidence).length > 0 && <div className="flag-evidence mono">{formatEvidence(flag)}</div>}
      <blockquote>“{flag.suggestedQuestion}”</blockquote>
      <div className="flag-actions">
        <button type="button" className="button" onClick={onJump}>
          <Icon name="eye" size={16} />
          Jump to
        </button>
        {onOverride && (
          <button type="button" className="button" onClick={onOverride}>
            Override…
          </button>
        )}
      </div>
    </article>
  );
}

export function OverrideLog({ override }: { override: Override }) {
  return (
    <div className="override-log">
      <div className="override-log__head">
        <span className="status-diamond" />
        <strong>Overridden by {override.by}</strong>
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

export function NotConnected({ children }: { children: ReactNode }) {
  return (
    <div className="not-connected">
      <strong>Not connected yet</strong>
      {children}
    </div>
  );
}
