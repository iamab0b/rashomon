import type { Override } from "@rashomon/schema";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { ResolvedEvent, Status } from "../scene";
import { Icon } from "./Icon";
import { createSubmitGuard, OverrideConfirm } from "./OverrideConfirm";
import { buildOverride, canConfirm, MIN_REASON_LENGTH, reasonLength } from "./overrideReason";
import { eventTime, eventTitle, StatusToken, words } from "./shared";

export type OverrideDialogProps = {
  event: ResolvedEvent;
  status: Status;
  by: string;
  onConfirm: (override: Override) => void;
  onClose: () => void;
};

const FOCUSABLE = 'button:not([disabled]), textarea, input, [href], [tabindex]:not([tabindex="-1"])';

function trapTab(e: KeyboardEvent<HTMLElement>) {
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function OverrideDialog({ event, status, by, onConfirm, onClose }: OverrideDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const titleId = useId();
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const guard = useRef(createSubmitGuard()).current;
  const acceptRef = useRef<HTMLButtonElement>(null);
  const valid = canConfirm(reason);

  const close = () => {
    onClose();
    opener?.focus();
  };

  const cancelConfirm = () => {
    setConfirming(false);
    acceptRef.current?.focus();
  };

  const apply = () => {
    if (!valid || !guard.claim()) return;
    setSubmitting(true);
    try {
      onConfirm(buildOverride(by, reason, event.flags.map((flag) => flag.id), Date.now()));
      opener?.focus();
    } catch (err) {
      guard.release();
      setSubmitting(false);
      setConfirming(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-hidden={confirming || undefined}
        inert={confirming}
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          } else if (e.key === "Tab") {
            trapTab(e);
          }
        }}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !confirming) setConfirming(true);
        }}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">Investigator override</span>
            <h2 id={titleId}>Override the scene reading</h2>
          </div>
          <button type="button" className="close" onClick={close} aria-label="Close">
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
                <q className="waived-question">{flag.suggestedQuestion}</q>
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
            onChange={(e) => {
              setReason(e.currentTarget.value);
              setError("");
            }}
            placeholder="Why this reading should be overridden here, in one sentence"
          />
          <small className={valid ? "ok" : undefined}>
            {reasonLength(reason)} / {MIN_REASON_LENGTH} characters minimum
          </small>
        </label>

        <label className="readonly-field">
          <span className="field-label">Investigator</span>
          <input value={by} readOnly />
        </label>

        {error && (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" ref={acceptRef} className="button button--primary" disabled={!valid}>
            <span className="status-diamond" />
            Accept with reason
          </button>
        </div>
      </form>
      {confirming && (
        <OverrideConfirm
          event={event}
          reason={reason}
          submitting={submitting}
          onCancel={cancelConfirm}
          onConfirm={apply}
          trapTab={trapTab}
        />
      )}
    </div>
  );
}
