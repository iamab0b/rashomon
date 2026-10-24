import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import type { ResolvedEvent } from "../scene";
import { eventTime, eventTitle, words } from "./shared";
import "./override-confirm.css";

export const CONFIRM_TITLE = "Apply this override?";
export const CONFIRM_BODY =
  "This will mark this finding as overridden for this event. Your reason will be recorded in the event history. This action cannot currently be undone.";

export function createSubmitGuard() {
  let used = false;
  return {
    claim: () => {
      if (used) return false;
      used = true;
      return true;
    },
    release: () => {
      used = false;
    },
  };
}

export function OverrideConfirm({
  event,
  reason,
  submitting,
  onCancel,
  onConfirm,
  trapTab,
}: {
  event: ResolvedEvent;
  reason: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  trapTab: (e: KeyboardEvent<HTMLElement>) => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      className="modal-backdrop modal-backdrop--confirm"
      onMouseDown={(e) => {
        e.stopPropagation();
        if (!submitting) onCancel();
      }}
    >
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="modal modal--confirm"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            if (!submitting) onCancel();
          } else if (e.key === "Enter") {
            if ((e.target as HTMLElement).dataset.action === "cancel") return;
            e.preventDefault();
            onConfirm();
          } else if (e.key === "Tab") {
            trapTab(e);
          }
        }}
      >
        <h2 id={titleId}>{CONFIRM_TITLE}</h2>
        <p id={bodyId} className="confirm-body">
          {CONFIRM_BODY}
        </p>
        <div className="override-event">
          <div>
            <strong>
              {event.id} · {eventTitle(event)}
            </strong>
            <span className="mono">{eventTime(event)}</span>
          </div>
        </div>
        {event.flags.length > 0 && (
          <p className="confirm-findings">
            Finding{event.flags.length === 1 ? "" : "s"}:{" "}
            {event.flags.map((flag) => words(flag.check)).join(", ")}
          </p>
        )}
        <blockquote className="confirm-reason">“{reason.trim()}”</blockquote>
        <div className="modal-actions">
          <button type="button" className="button" data-action="cancel" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="button button--primary" onClick={onConfirm} disabled={submitting} aria-busy={submitting}>
            <span className="status-diamond" />
            Confirm override
          </button>
        </div>
      </div>
    </div>
  );
}
