import type { Override } from "@rashomon/schema";
import { useEffect, useState } from "react";
import { useGraph, useSelection, type Flag, type ResolvedEvent, type Status } from "../scene";
import { Icon } from "./Icon";
import { buildOverride, canConfirm, MIN_REASON_LENGTH, reasonLength } from "./overrideReason";
import "./rashomon-ui.css";

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

const TOAST_MS = 2200;

function StatusToken({ status }: { status: Status }) {
  return (
    <span className={`status-token status-${status}`}>
      {status === "implausible" && <Icon name="warning" size={12} />}
      {status === "overridden" && <span className="status-diamond" />}
      {STATUS_LABELS[status]}
    </span>
  );
}

function eventTitle(event: ResolvedEvent): string {
  return `${event.actor} · ${event.action.replace(/_/g, " ")}`;
}

function eventTime(event: ResolvedEvent): string {
  return `${event.tStart.toFixed(1)}–${event.tEnd.toFixed(1)} s`;
}

function formatEvidence(flag: Flag): string {
  return Object.entries(flag.evidence)
    .map(([key, value]) => `${key} ${typeof value === "number" ? Number(value.toFixed(2)) : value}`)
    .join(" · ");
}

function FlagCard({
  flag,
  waived,
  onJump,
  onOverride,
}: {
  flag: Flag;
  waived: boolean;
  onJump: () => void;
  onOverride?: () => void;
}) {
  return (
    <article className={`hard-flag${waived ? " is-waived" : ""}`}>
      <div className="hard-flag__heading">
        <div className="hard-flag__warning">
          <Icon name="warning" size={16} />
        </div>
        <div className="flag-chips">
          <span className="check-chip">{flag.check.replace(/_/g, " ")}</span>
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

export type OverrideDialogProps = {
  event: ResolvedEvent;
  status: Status;
  by: string;
  onConfirm: (override: Override) => void;
  onClose: () => void;
};

export function OverrideDialog({ event, status, by, onConfirm, onClose }: OverrideDialogProps) {
  const [reason, setReason] = useState("");
  const valid = canConfirm(reason);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        role="dialog"
        aria-label={`Override ${event.id}`}
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onConfirm(buildOverride(by, reason, event.flags.map((flag) => flag.id), Date.now()));
        }}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">Investigator override</span>
            <h2>Override the room’s reading</h2>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>

        <div className="override-event">
          <div>
            <strong>
              {event.id} · {eventTitle(event)}
            </strong>
            <span className="mono">{eventTime(event)}</span>
          </div>
          <StatusToken status={status} />
        </div>

        <div className="waived-flags">
          <span className="field-label">Flags that will be waived</span>
          {event.flags.map((flag) => (
            <div key={flag.id}>
              <Icon name="warning" size={12} />
              <p>
                <b className="mono">{flag.check.replace(/_/g, " ")}</b> — {flag.detail}
              </p>
            </div>
          ))}
        </div>

        <label className="reason-field">
          <span className="field-label">
            Reason <i>Required</i>
          </span>
          <textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            placeholder="Why the room’s reading should be overridden here, in one sentence"
          />
          <small className={valid ? "ok" : undefined}>
            {reasonLength(reason)} / {MIN_REASON_LENGTH} characters minimum
          </small>
        </label>

        <label className="readonly-field">
          <span className="field-label">Investigator</span>
          <input value={by} readOnly />
        </label>

        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={!valid}>
            <span className="status-diamond" />
            Accept with reason
          </button>
        </div>
      </form>
    </div>
  );
}

// Shows the selected event, else the first flagged one (e5), and keeps overrides
// locally until the scene exposes a way to apply them.
export function OverridePanel({ by = "investigator" }: { by?: string }) {
  const { resolved, statuses } = useGraph();
  const { selectedEventId, select } = useSelection();
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  const events = resolved?.events ?? [];
  const event =
    events.find((e) => e.id === selectedEventId) ?? events.find((e) => e.flags.length > 0) ?? null;

  if (!event) {
    return (
      <div className="rui">
        <div className="flags-empty">
          <strong>No open flags.</strong> The room agrees with everything stated so far.
        </div>
      </div>
    );
  }

  const override = overrides[event.id];
  const status: Status = override ? "overridden" : (statuses[event.id] ?? event.status);

  return (
    <div className="rui">
      <div className="section-title">
        <h2>Flags</h2>
        <span>
          {event.flags.length} on this event{selectedEventId ? "" : " · first flagged event"}
        </span>
      </div>

      <div className="event-head">
        <div>
          <strong>
            {event.id} · {eventTitle(event)}
          </strong>
          <span className="event-meta mono">
            {eventTime(event)} · {event.sources.join(", ")}
          </span>
        </div>
        <StatusToken status={status} />
      </div>

      {event.flags.length === 0 ? (
        <div className="flags-empty">No flags on this event.</div>
      ) : (
        <div className="flag-list">
          {event.flags.map((flag) => (
            <FlagCard
              key={flag.id}
              flag={flag}
              waived={Boolean(override)}
              onJump={() => select(event.id)}
              onOverride={override ? undefined : () => setDialogOpen(true)}
            />
          ))}
        </div>
      )}

      {override && (
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
      )}

      {dialogOpen && (
        <OverrideDialog
          key={event.id}
          event={event}
          status={status}
          by={by}
          onClose={() => setDialogOpen(false)}
          onConfirm={(next) => {
            setOverrides((prev) => ({ ...prev, [event.id]: next }));
            setDialogOpen(false);
            setToast("Overridden. The badge stays on this event.");
          }}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <span>✓</span>
          {toast}
        </div>
      )}
    </div>
  );
}
