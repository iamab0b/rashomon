import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { useGraph, useGraphActions, useSelection, useTimeline, type ResolvedEvent, type Status } from "../scene";
import { EventsTab } from "./EventsTab";
import { FlagsTab, openFlagCount } from "./FlagsTab";
import { eventNeighbors } from "./history";
import { ContextDrawer, type ContextView } from "./ContextDrawer";
import { Icon } from "./Icon";
import { OverrideDialog } from "./OverrideDialog";
import { eventDisplay, type PendingOverrides } from "./overridePending";
import { anchorsFor, eventPlace } from "./places";
import { playbackActiveIds } from "./playback";
import { usePlaybackKeys } from "./usePlaybackKeys";
import { actorLabel, eventTime, words, type PanelContext } from "./shared";
import { transcriptFor } from "./transcript";
import { useGraphMode } from "./useGraphMode";
import { WitnessesTab } from "./WitnessesTab";
import "./rashomon-ui.css";
import "./panel-layout.css";

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
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};

function PanelColumn({ children, padded = false }: { children: ReactNode; padded?: boolean }) {
  return <div style={padded ? { ...COLUMN_STYLE, padding: 16 } : COLUMN_STYLE}>{children}</div>;
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
  const [focusSourceId, setFocusSourceId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [contextView, setContextView] = useState<ContextView | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, [activeTab]);

  useEffect(() => {
    if (!selectedEventId) return;
    panelRef.current
      ?.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(selectedEventId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedEventId, activeTab]);

  useEffect(() => {
    setFocusSourceId(null);
  }, [selectedEventId]);

  useEffect(() => {
    if (!contextView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || dialogEventId) return;
      setContextView(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contextView, dialogEventId]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!resolved) {
    return (
      <PanelColumn padded>
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
    openSource: (id) => {
      setFocusSourceId(id);
      setContextView("transcript");
    },
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
  const nav = eventNeighbors(resolved.events, selectedEvent?.id ?? null);
  const step = (dir: -1 | 1) => {
    const target = dir === -1 ? nav.prev : nav.next;
    if (target) jumpTo(target.id);
  };

  return (
    <>
      <PanelColumn>
        <div className="rui panel panel--docked" ref={panelRef}>
          <div className="panel-head">
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

            <div
              className="selection-bar"
              role="group"
              aria-label="Selected event"
              onKeyDown={(e) => {
                if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                e.preventDefault();
                step(e.key === "ArrowUp" ? -1 : 1);
              }}
            >
              <div>
                <span className="eyebrow">
                  Selected event
                  {nav.index >= 0 && (
                    <small>
                      Event {nav.index + 1} of {nav.total}
                    </small>
                  )}
                </span>
                {selectedEvent ? (
                  <>
                    <strong>
                      {selectedEvent.id} · {actorLabel(resolved, selectedEvent.actor)} · {words(selectedEvent.action)}
                    </strong>
                    <span className="selection-meta">
                      <span className="mono">{eventTime(selectedEvent)}</span>
                      {context.placeOf(selectedEvent) && <> · {context.placeOf(selectedEvent)}</>}
                    </span>
                  </>
                ) : (
                  <strong className="none">None selected</strong>
                )}
              </div>
              <div className="selection-nav">
                <button
                  type="button"
                  className="button button--small"
                  aria-label="Previous event"
                  title="Previous event"
                  disabled={!nav.prev}
                  onClick={() => step(-1)}
                >
                  <Icon name="chevronUp" size={14} />
                </button>
                <button
                  type="button"
                  className="button button--small"
                  aria-label="Next event"
                  title="Next event"
                  disabled={!nav.next}
                  onClick={() => step(1)}
                >
                  <Icon name="chevron" size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className="panel-scroll" ref={scrollRef}>
            <div className="tab-panel" key={tab.id} role="tabpanel">
              <tab.Component {...context} />
            </div>
          </div>

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
      <ContextDrawer
        view={contextView}
        onOpen={setContextView}
        onClose={() => setContextView(null)}
        context={context}
        focusSourceId={focusSourceId}
      />
    </>
  );
}
