import type { Override } from "@rashomon/schema";
import { useState } from "react";
import { useGraph, useSelection, type ResolvedEvent, type Status } from "../scene";
import { buildOverride, canConfirm, MIN_REASON_LENGTH, reasonLength } from "./overrideReason";

const AMBER = "#d29922";

const STATUS_COLORS: Record<Status, string> = {
  proposed: "#8b949e",
  plausible: "#3fb950",
  implausible: "#f85149",
  overridden: AMBER,
  superseded: "#6e7681",
};

const cardStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 14,
  background: "#11151b",
  border: "1px solid #222831",
  borderRadius: 6,
  color: "#c9d1d9",
  font: "13px/1.45 system-ui, sans-serif",
} as const;

const flagStyle = {
  padding: 10,
  background: "#161b22",
  border: "1px solid #30363d",
  borderRadius: 4,
} as const;

const textareaStyle = {
  width: "100%",
  minHeight: 72,
  padding: 8,
  boxSizing: "border-box",
  background: "#0b0d10",
  color: "#e6edf3",
  border: "1px solid #30363d",
  borderRadius: 4,
  font: "inherit",
  resize: "vertical",
} as const;

const buttonStyle = {
  padding: "6px 12px",
  background: "#1c2330",
  color: "#e6edf3",
  border: "1px solid #30363d",
  borderRadius: 4,
  cursor: "pointer",
  font: "inherit",
} as const;

function badgeStyle(status: Status) {
  return {
    padding: "1px 8px",
    border: `1px solid ${STATUS_COLORS[status]}`,
    borderRadius: 10,
    color: STATUS_COLORS[status],
    fontSize: 11,
  } as const;
}

export type OverrideDialogProps = {
  event: ResolvedEvent;
  status: Status;
  by: string;
  onConfirm: (override: Override) => void;
  onCancel?: () => void;
};

export function OverrideDialog({ event, status, by, onConfirm, onCancel }: OverrideDialogProps) {
  const [reason, setReason] = useState("");
  const enabled = canConfirm(reason) && status !== "overridden";

  const confirm = () => {
    if (!enabled) return;
    onConfirm(buildOverride(by, reason, event.flags.map((flag) => flag.id), Date.now()));
    setReason("");
  };

  return (
    <section role="dialog" aria-label={`Override ${event.id}`} style={cardStyle}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <strong>
          {event.id} · {event.actor} · {event.action}
        </strong>
        <span style={badgeStyle(status)}>{status}</span>
      </header>
      <div style={{ color: "#8b949e", fontSize: 12 }}>
        {event.tStart.toFixed(1)}–{event.tEnd.toFixed(1)} s · sources {event.sources.join(", ")}
      </div>

      {event.flags.length === 0 ? (
        <div style={{ color: "#8b949e" }}>No flags on this event.</div>
      ) : (
        event.flags.map((flag) => (
          <div key={flag.id} style={flagStyle}>
            <div style={{ color: flag.severity === "hard" ? "#f85149" : AMBER }}>
              {flag.check} ({flag.severity})
            </div>
            <div>{flag.detail}</div>
            <div style={{ marginTop: 6, color: "#8b949e" }}>Ask: “{flag.suggestedQuestion}”</div>
          </div>
        ))
      )}

      {event.flags.length > 0 && status !== "overridden" && (
        <>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            Reason for override
            <textarea
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
              placeholder="Why the investigator accepts this event despite the flag"
              style={textareaStyle}
            />
          </label>
          <div style={{ color: canConfirm(reason) ? "#3fb950" : "#8b949e", fontSize: 12 }}>
            {reasonLength(reason)} / {MIN_REASON_LENGTH} characters minimum
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {onCancel && (
              <button type="button" style={buttonStyle} onClick={onCancel}>
                Cancel
              </button>
            )}
            <button
              type="button"
              disabled={!enabled}
              onClick={confirm}
              style={{
                ...buttonStyle,
                background: enabled ? AMBER : "#1c2330",
                color: enabled ? "#0b0d10" : "#6e7681",
                cursor: enabled ? "pointer" : "not-allowed",
              }}
            >
              Confirm override
            </button>
          </div>
        </>
      )}
    </section>
  );
}

// Picks the selected event, else the first flagged one (e5 on the fixture), and keeps
// overrides locally until fixture mode can apply them to the scene.
export function OverridePanel({ by = "investigator" }: { by?: string }) {
  const { resolved, statuses } = useGraph();
  const { selectedEventId, clear } = useSelection();
  const [overrides, setOverrides] = useState<Record<string, Override>>({});

  const events = resolved?.events ?? [];
  const event =
    events.find((e) => e.id === selectedEventId) ?? events.find((e) => e.flags.length > 0) ?? null;
  if (!event) return <div style={{ color: "#8b949e" }}>No flagged events.</div>;

  const status: Status = overrides[event.id] ? "overridden" : (statuses[event.id] ?? event.status);
  return (
    <OverrideDialog
      key={event.id}
      event={event}
      status={status}
      by={by}
      onConfirm={(override) => setOverrides((prev) => ({ ...prev, [event.id]: override }))}
      onCancel={selectedEventId ? clear : undefined}
    />
  );
}
