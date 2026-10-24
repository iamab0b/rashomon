import { useEffect, useRef } from "react";
import { HistoryTab } from "./HistoryTab";
import { Icon, type IconName } from "./Icon";
import type { PanelContext } from "./shared";
import { TranscriptView } from "./TranscriptView";
import "./context-drawer.css";

export type ContextView = "transcript" | "history";

export const CONTEXT_DRAWER_ID = "context-drawer";

const VIEWS: { id: ContextView; label: string; icon: IconName }[] = [
  { id: "transcript", label: "Transcript", icon: "transcript" },
  { id: "history", label: "History", icon: "history" },
];

export function ContextDrawer({
  view,
  onOpen,
  onClose,
  context,
  focusSourceId,
}: {
  view: ContextView | null;
  onOpen: (view: ContextView) => void;
  onClose: () => void;
  context: PanelContext;
  focusSourceId: string | null;
}) {
  const open = view !== null;
  const closeRef = useRef<HTMLButtonElement>(null);
  const railRefs = useRef<Partial<Record<ContextView, HTMLButtonElement | null>>>({});
  const lastView = useRef<ContextView | null>(view);

  useEffect(() => {
    if (view) lastView.current = view;
  }, [view]);

  useEffect(() => {
    if (open) closeRef.current?.focus({ preventScroll: true });
    else if (lastView.current) railRefs.current[lastView.current]?.focus({ preventScroll: true });
  }, [open]);

  return (
    <aside className="rui context-column" data-open={open ? "" : undefined} aria-label="Context">
      <div className="context-rail">
        {VIEWS.map((v) => (
          <button
            type="button"
            key={v.id}
            ref={(el) => {
              railRefs.current[v.id] = el;
            }}
            className="context-rail__button"
            aria-expanded={view === v.id}
            aria-controls={CONTEXT_DRAWER_ID}
            title={`Show ${v.label.toLowerCase()}`}
            tabIndex={open ? -1 : 0}
            onClick={() => onOpen(v.id)}
          >
            <Icon name={v.icon} size={16} />
            <span>{v.label}</span>
          </button>
        ))}
      </div>
      <div id={CONTEXT_DRAWER_ID} className="context-inner" inert={!open}>
        <header className="context-header">
          <div className="segmented context-tabs" role="tablist" aria-label="Context view">
            {VIEWS.map((v) => (
              <button
                type="button"
                role="tab"
                key={v.id}
                aria-selected={view === v.id}
                className={view === v.id ? "active" : undefined}
                onClick={() => onOpen(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button type="button" className="close" ref={closeRef} onClick={onClose} aria-label="Close context panel" title="Close">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div role="tabpanel" aria-label={view === "history" ? "History" : "Transcript"}>
          {view === "history" ? (
            <HistoryTab {...context} />
          ) : view === "transcript" ? (
            <TranscriptView {...context} focusId={focusSourceId} />
          ) : null}
        </div>
      </div>
    </aside>
  );
}
