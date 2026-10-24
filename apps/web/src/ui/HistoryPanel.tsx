import { useEffect, useRef } from "react";
import { HistoryTab } from "./HistoryTab";
import { Icon } from "./Icon";
import type { PanelContext } from "./shared";
import "./history-panel.css";

export const HISTORY_PANEL_ID = "history-panel";

export function HistoryPanel({ open, onClose, context }: { open: boolean; onClose: () => void; context: PanelContext }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <aside
      id={HISTORY_PANEL_ID}
      className="rui history-column"
      data-open={open ? "" : undefined}
      aria-label="History"
      aria-hidden={!open}
      inert={!open}
    >
      <div className="history-inner">
        <header className="history-header">
          <span className="eyebrow">History</span>
          <button type="button" className="close" ref={closeRef} onClick={onClose} aria-label="Close history">
            <Icon name="x" size={16} />
          </button>
        </header>
        <HistoryTab {...context} />
      </div>
    </aside>
  );
}
