import { useEffect, useState, type ComponentType, type CSSProperties } from "react";
import { useGraph, useSelection, useTimeline, type ResolvedEvent, type Status } from "../scene";
import { EventsTab } from "./EventsTab";
import { FlagsTab, openFlagCount } from "./FlagsTab";
import { HistoryTab } from "./HistoryTab";
import { OverrideDialog } from "./OverrideDialog";
import type { Overrides, PanelContext } from "./shared";
import { isStatusPreview, previewStatuses } from "./statusPreview";
import { WitnessesTab } from "./WitnessesTab";
import "./rashomon-ui.css";

type Tab = {
  id: string;
  label: string;
  count?: (context: PanelContext) => number;
  Component: ComponentType<PanelContext>;
};

const TABS: Tab[] = [
  { id: "flags", label: "Flags", count: openFlagCount, Component: FlagsTab },
  { id: "events", label: "Events", count: ({ graph }) => graph.events.length, Component: EventsTab },
  { id: "history", label: "History", Component: HistoryTab },
  { id: "witnesses", label: "Witnesses", Component: WitnessesTab },
];

const TOAST_MS = 2200;

export function RightPanel({ by = "investigator" }: { by?: string }) {
  const { resolved, statuses } = useGraph();
  const { selectedEventId, select } = useSelection();
  const { setT, pause } = useTimeline();
  const [activeTab, setActiveTab] = useState(TABS[0]!.id);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [dialogEventId, setDialogEventId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!resolved) {
    return (
      <div className="rui">
        <div className="flags-empty">
          <p>Loading the reconstruction…</p>
        </div>
      </div>
    );
  }

  const gateStatus = (id: string, fallback: Status): Status => statuses[id] ?? fallback;
  const preview = isStatusPreview(window.location.search)
    ? previewStatuses(resolved.events, (id) =>
        gateStatus(id, resolved.events.find((e) => e.id === id)?.status ?? "proposed"),
      )
    : {};

  const statusOf = (event: ResolvedEvent): Status =>
    overrides[event.id] ? "overridden" : (preview[event.id] ?? gateStatus(event.id, event.status));

  const jumpTo = (eventId: string) => {
    const event = resolved.events.find((e) => e.id === eventId);
    select(eventId);
    if (!event) return;
    pause();
    setT(event.tStart);
  };

  const context: PanelContext = {
    graph: resolved,
    overrides,
    statusOf,
    selectedEventId,
    jumpTo,
    openOverride: setDialogEventId,
  };

  const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0]!;
  const dialogEvent = resolved.events.find((e) => e.id === dialogEventId) ?? null;

  return (
    <div className="rui panel">
      <nav className="tabs" style={{ "--tab-count": TABS.length } as CSSProperties}>
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            className={t.id === tab.id ? "tab active" : "tab"}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
            {t.count && <span>{t.count(context)}</span>}
          </button>
        ))}
      </nav>

      <tab.Component {...context} />

      {dialogEvent && (
        <OverrideDialog
          key={dialogEvent.id}
          event={dialogEvent}
          status={statusOf(dialogEvent)}
          by={by}
          onClose={() => setDialogEventId(null)}
          onConfirm={(override) => {
            setOverrides((prev) => ({ ...prev, [dialogEvent.id]: override }));
            setDialogEventId(null);
            select(dialogEvent.id);
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
