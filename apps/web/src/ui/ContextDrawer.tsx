import { useEffect, useRef } from "react";
import type { GraphMode } from "./graphMode";
import { HistoryTab } from "./HistoryTab";
import { Icon, type IconName } from "./Icon";
import type { PanelContext } from "./shared";
import { StatementSection } from "./StatementSection";
import { TranscriptView } from "./TranscriptView";
import "./context-drawer.css";

export type ContextView = "statement" | "transcript" | "history";

export const CONTEXT_DRAWER_ID = "context-drawer";

const VIEWS: { id: ContextView; label: string; icon: IconName }[] = [
  { id: "statement", label: "Statement", icon: "statement" },
  { id: "transcript", label: "Transcript", icon: "transcript" },
  { id: "history", label: "History", icon: "history" },
];

export function ContextDrawer({
  view,
  onOpen,
  onClose,
  context,
  focusSourceId,
  overrideFocusId = null,
  historyAccent = false,
  mode = "fixture",
}: {
  view: ContextView | null;
  onOpen: (view: ContextView) => void;
  onClose: () => void;
  context: PanelContext;
  focusSourceId: string | null;
  overrideFocusId?: string | null;
  historyAccent?: boolean;
  mode?: GraphMode;
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
            className={`context-rail__button${v.id === "history" && historyAccent ? " has-override" : ""}`}
            aria-expanded={view === v.id}
            aria-controls={CONTEXT_DRAWER_ID}
            aria-description={v.id === "history" && historyAccent ? "Selected event has override history" : undefined}
            title={v.id === "history" && historyAccent ? "Show history · selected event was overridden" : `Show ${v.label.toLowerCase()}`}
            tabIndex={open ? -1 : 0}
            onClick={() => onOpen(v.id)}
          >
            <Icon name={v.icon} size={16} />
            <span>{v.label}</span>
            {v.id === "history" && historyAccent && <span className="status-diamond" aria-hidden />}
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
                className={[view === v.id && "active", v.id === "history" && historyAccent && "has-override"].filter(Boolean).join(" ") || undefined}
                onClick={() => onOpen(v.id)}
              >
                {v.label}
                {v.id === "history" && historyAccent && <span className="status-diamond" aria-hidden />}
              </button>
            ))}
          </div>
          <button type="button" className="close" ref={closeRef} onClick={onClose} aria-label="Close context panel" title="Close">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div role="tabpanel" aria-label="Statement" hidden={view !== "statement"}>
          <StatementSection graph={context.graph} mode={mode} onSelect={context.jumpTo} />
        </div>
        <div role="tabpanel" aria-label={view === "history" ? "History" : "Transcript"} hidden={view === "statement"}>
          {view === "history" ? (
            <HistoryTab {...context} overrideFocusId={overrideFocusId} />
          ) : view === "transcript" ? (
            <TranscriptView {...context} focusId={focusSourceId} />
          ) : null}
        </div>
      </div>
    </aside>
  );
}
