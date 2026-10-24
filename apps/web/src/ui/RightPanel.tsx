import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { useGraph, useGraphActions, useSelection, useTimeline, type ResolvedEvent, type Status } from "../scene";
import { EventsTab } from "./EventsTab";
import { FlagsTab, openFlagCount } from "./FlagsTab";
import { HISTORY_PANEL_ID, HistoryPanel } from "./HistoryPanel";
import { OverrideDialog } from "./OverrideDialog";
import { eventDisplay, type PendingOverrides } from "./overridePending";
import { anchorsFor, eventPlace } from "./places";
import { playbackActiveIds } from "./playback";
import { usePlaybackKeys } from "./usePlaybackKeys";
import { actorLabel, words, type PanelContext } from "./shared";
import { transcriptFor } from "./transcript";
import { TranscriptDrawer } from "./TranscriptDrawer";
import { useGraphMode } from "./useGraphMode";
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
  { id: "witnesses", label: "Witnesses", Component: WitnessesTab },
];

const TOAST_MS = 2200;
const PANEL_WIDTH_PX = 360;

const COLUMN_STYLE: CSSProperties = {
  width: PANEL_WIDTH_PX,
  flex: "0 0 auto",
  borderLeft: "1px solid #222831",
  color: "#c9d1d9",
  padding: 16,
  boxSizing: "border-box",
  overflowY: "auto",
};

function PanelColumn({ children }: { children: ReactNode }) {
  return <div style={COLUMN_STYLE}>{children}</div>;
}

export function RightPanel({ by = "investigator" }: { by?: string }) {
  const { resolved, statuses } = useGraph();
  const { selectedEventId, select } = useSelection();
  const { t, playing, setT, play, pause } = useTimeline();
  usePlaybackKeys(() => (playing ? pause() : play()));
  const { applyPatches } = useGraphActions();
  const [mode] = useGraphMode();
  const [activeTab, setActiveTab] = useState(TABS[0]!.id);
  const [pending, setPending] = useState<PendingOverrides>({});
  const [dialogEventId, setDialogEventId] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyButtonRef = useRef<HTMLButtonElement>(null);

  const closeHistory = () => {
    setHistoryOpen(false);
    historyButtonRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!historyOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || dialogEventId) return;
      setHistoryOpen(false);
      historyButtonRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyOpen, dialogEventId]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!resolved) {
    return (
      <PanelColumn>
        <div className="rui">
          <div className="flags-empty">
            <p>Loading the reconstruction…</p>
          </div>
        </div>
      </PanelColumn>
    );
  }

  const statusOf = (event: ResolvedEvent): Status => eventDisplay(event, statuses, pending).status;

  const awaitingGate = mode === "live";

  const jumpTo = (eventId: string) => {
    const event = resolved.events.find((e) => e.id === eventId);
    select(eventId);
    if (!event) return;
    pause();
    setT(event.tStart);
  };

  const context: PanelContext = {
    graph: resolved,
    statusOf,
    pendingNoteOf: (event) => eventDisplay(event, statuses, pending).pendingNote,
    isPending: (event) => awaitingGate && statusOf(event) === "proposed",
    selectedEventId,
    playbackActive: playbackActiveIds(resolved.events, t, statusOf),
    playing,
    placeOf: (event) => eventPlace(resolved.sceneId, event.action, anchorsFor(mode, resolved.sceneId, event)),
    jumpTo,
    openOverride: setDialogEventId,
    openSource: setSourceId,
    notify: setToast,
    transcript: transcriptFor(mode, resolved.sceneId),
  };

  const tabIndex = Math.max(
    0,
    TABS.findIndex((t) => t.id === activeTab),
  );
  const tab = TABS[tabIndex]!;
  const dialogEvent = resolved.events.find((e) => e.id === dialogEventId) ?? null;
  const selectedEvent = resolved.events.find((e) => e.id === selectedEventId) ?? null;

  return (
    <>
      <PanelColumn>
        <div className="rui panel">
          <nav
            className="tabs"
            role="tablist"
            style={{ "--tab-count": TABS.length, "--tab-index": tabIndex } as CSSProperties}
          >
            {TABS.map((t) => (
              <button
                type="button"
                role="tab"
                aria-selected={t.id === tab.id}
                key={t.id}
                className={t.id === tab.id ? "tab active" : "tab"}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
                {t.count && <span>{t.count(context)}</span>}
              </button>
            ))}
            <span className="tab-indicator" aria-hidden />
          </nav>

          <div className="selection-bar">
            <div>
              <span className="eyebrow">Selected event</span>
              {selectedEvent ? (
                <strong>
                  {selectedEvent.id} · {actorLabel(resolved, selectedEvent.actor)} · {words(selectedEvent.action)}
                </strong>
              ) : (
                <strong className="none">None selected</strong>
              )}
            </div>
            <button
              type="button"
              ref={historyButtonRef}
              className="button button--small"
              aria-expanded={historyOpen}
              aria-controls={HISTORY_PANEL_ID}
              onClick={() => (historyOpen ? closeHistory() : setHistoryOpen(true))}
            >
              History
            </button>
          </div>

          <div className="tab-panel" key={tab.id} role="tabpanel">
            <tab.Component {...context} />
          </div>

          {sourceId && (
            <TranscriptDrawer transcript={context.transcript} activeId={sourceId} onClose={() => setSourceId(null)} />
          )}

          {dialogEvent && (
            <OverrideDialog
              key={dialogEvent.id}
              event={dialogEvent}
              status={statusOf(dialogEvent)}
              by={by}
              onClose={() => setDialogEventId(null)}
              onConfirm={(override) => {
                applyPatches([{ op: "override", id: dialogEvent.id, reason: override.reason, by: override.by }]);
                setPending((prev) => ({ ...prev, [dialogEvent.id]: override.reason }));
                setDialogEventId(null);
                select(dialogEvent.id);
                setToast("Override sent. Reason recorded in History.");
              }}
            />
          )}

          {toast && (
            <div className="toast" role="status">
              {!toast.startsWith("Couldn't") && <span>✓</span>}
              {toast}
            </div>
          )}
        </div>
      </PanelColumn>
      <HistoryPanel open={historyOpen} onClose={closeHistory} context={context} />
    </>
  );
}
