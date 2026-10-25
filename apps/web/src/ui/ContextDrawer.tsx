import { useEffect, useRef } from "react";
import { HistoryTab } from "./HistoryTab";
import { Icon, type IconName } from "./Icon";
import type { PanelContext } from "./shared";
import { StatementSection } from "./StatementSection";
import { TranscriptView } from "./TranscriptView";
import "./context-drawer.css";

export type ContextView = "statement" | "transcript" | "history";

export const CONTEXT_DRAWER_ID = "context-drawer";

type RailItem = { id: ContextView; label: string; title: string; heading: string; icon: IconName };

const REVIEW: readonly RailItem[] = [
  { id: "transcript", label: "Transcript", title: "Show transcript", heading: "Transcript", icon: "transcript" },
  { id: "history", label: "History", title: "Show history", heading: "History", icon: "history" },
];

const INPUT: readonly RailItem[] = [
  { id: "statement", label: "Add statement", title: "Add witness statement", heading: "Add witness statement", icon: "plus" },
];

const VIEWS: readonly RailItem[] = [...REVIEW, ...INPUT];

export function ContextDrawer({
  view,
  onOpen,
  onClose,
  context,
  focusSourceId,
  overrideFocusId = null,
  historyAccent = false,
  preferredWitness = null,
}: {
  preferredWitness?: { id: string; nonce: number } | null;
  view: ContextView | null;
  onOpen: (view: ContextView) => void;
  onClose: () => void;
  context: PanelContext;
  focusSourceId: string | null;
  overrideFocusId?: string | null;
  historyAccent?: boolean;
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
        {[
          { name: "Review", items: REVIEW },
          { name: "Add source", items: INPUT },
        ].map((group, g) => (
          <div key={group.name} className={`context-rail__group${g > 0 ? " context-rail__group--input" : ""}`} role="group" aria-label={group.name}>
            {group.items.map((v) => (
              <button
                type="button"
                key={v.id}
                ref={(el) => {
                  railRefs.current[v.id] = el;
                }}
                className={`context-rail__button${v.id === "history" && historyAccent ? " has-override" : ""}`}
                aria-expanded={view === v.id}
                aria-controls={CONTEXT_DRAWER_ID}
                aria-label={v.id === "statement" ? v.title : undefined}
                aria-description={v.id === "history" && historyAccent ? "Selected event has override history" : undefined}
                title={v.id === "history" && historyAccent ? "Show history · selected event was overridden" : v.title}
                onClick={() => (view === v.id ? onClose() : onOpen(v.id))}
              >
                <Icon name={v.icon} size={16} />
                <span>{v.label}</span>
                {v.id === "history" && historyAccent && <span className="status-diamond" aria-hidden />}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div id={CONTEXT_DRAWER_ID} className="context-inner" inert={!open}>
        <header className="context-header">
          <h2 className="context-title">{VIEWS.find((v) => v.id === (view ?? lastView.current))?.heading ?? ""}</h2>
          <button type="button" className="close" ref={closeRef} onClick={onClose} aria-label="Close context panel" title="Close">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div role="region" aria-label="Statement" hidden={view !== "statement"}>
          <StatementSection graph={context.graph} onSelect={context.jumpTo} preferredWitness={preferredWitness} />
        </div>
        <div role="region" aria-label={view === "history" ? "History" : "Transcript"} hidden={view === "statement"}>
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
