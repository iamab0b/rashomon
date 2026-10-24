import type { Override } from "@rashomon/schema";
import { useState } from "react";
import type { ResolvedEvent, Status } from "../scene";
import { Icon } from "./Icon";
import { buildOverride, canConfirm, MIN_REASON_LENGTH, reasonLength } from "./overrideReason";
import { eventTime, eventTitle, StatusToken, words } from "./shared";

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
                <b className="mono">{words(flag.check)}</b> — {flag.detail}
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
