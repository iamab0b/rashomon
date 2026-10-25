import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import {
  isGraphlessSearch,
  useGraph,
  useGraphActions,
  useGraphErrors,
  useSceneStatus,
  useSelection,
  useTimeline,
  useWitnessLayers,
  actorColor,
  type ResolvedEvent,
  type Status,
} from "../scene";
import { EventsTab } from "./EventsTab";
import { witnessTagOf } from "./witnesses";
import { WitnessStrip } from "./WitnessStrip";
import { scrollWithin } from "./scrollWithin";
import { useActorFocus } from "./actorFocus";
import { FlagsTab, openFlagCount } from "./FlagsTab";
import { ContextDrawer, type ContextView } from "./ContextDrawer";
import { OverrideDialog } from "./OverrideDialog";
import { loadingCopy } from "./loadingCopy";
import { eventDisplay, type PendingOverrides } from "./overridePending";
import { anchorsFor, eventPlace } from "./places";
import { playbackActiveIds } from "./playback";
import { usePlaybackKeys } from "./usePlaybackKeys";
import { PanelHeader } from "./PanelHeader";
import { timeBasis, type PanelContext } from "./shared";
import { transcriptFor } from "./transcript";
import { useGraphMode } from "./useGraphMode";
import { isStatementRejection } from "./statement";
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
  const { resolved, statuses, graph } = useGraph();
  const actorFocus = useActorFocus();
  const { witnesses: layers, hidden: hiddenWitnesses, toggle: toggleWitness, only: onlyWitness, showAll: showAllWitnesses } = useWitnessLayers();
  const { actionError } = useGraphErrors();
  const scene = useSceneStatus();
  const { selectedEventId, select } = useSelection();
  const { t, playing, setT, play, pause } = useTimeline();
  usePlaybackKeys(() => (playing ? pause() : play()));
  const { applyPatches } = useGraphActions();
  const [mode] = useGraphMode();
  const [activeTab, setActiveTab] = useState(TABS[0]!.id);
  const [pending, setPending] = useState<PendingOverrides>({});
  const [dialogEventId, setDialogEventId] = useState<string | null>(null);
  const [focusSourceId, setFocusSourceId] = useState<string | null>(null);
  const [overrideFocusId, setOverrideFocusId] = useState<string | null>(null);
  const [statementWitness, setStatementWitness] = useState<{ id: string; nonce: number } | null>(null);
  const [toast, setToast] = useState("");
  const [contextView, setContextView] = useState<ContextView | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, [activeTab]);

  useEffect(() => {
    if (!selectedEventId) return;
    scrollWithin(panelRef.current?.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(selectedEventId)}"]`));
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
    if (!actionError) return;
    const id = window.setTimeout(() => {
      if (!isStatementRejection(actionError)) setToast(`Couldn't apply the change: ${actionError}`);
    }, 0);
    return () => window.clearTimeout(id);
  }, [actionError]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!resolved) {
    return (
      <PanelColumn padded>
        <div className="rui">
          {scene.status === "error" ? (
            <div className="flags-empty" role="alert">
              <div>
                <strong>Scene not loaded</strong>
                <p>{scene.error ?? "The reconstruction could not be loaded."}</p>
              </div>
            </div>
          ) : (
            <div className="flags-empty">
              <p>{loadingCopy(isGraphlessSearch(window.location.search))}</p>
            </div>
          )}
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
    placeOf: (event) => eventPlace(resolved.sceneId, event.action, anchorsFor(graph, event)),
    timeBasisOf: (event) => timeBasis(graph, event),
    witnessOf: (event) => witnessTagOf(layers, event.witnessId),
    actorColorOf: (actorId) => {
      const index = resolved.actors.findIndex((actor) => actor.id === actorId);
      const actor = resolved.actors[index];
      return actor ? actorColor(actor.id, actor.role, index) : "var(--text-primary)";
    },
    witnessFilter: { layers, hidden: hiddenWitnesses, toggle: toggleWitness, only: onlyWitness, showAll: showAllWitnesses },
    actorFocus,
    jumpTo,
    openOverride: setDialogEventId,
    openSource: (id) => {
      setFocusSourceId(id);
      setContextView("transcript");
    },
    openStatement: (witnessId) => {
      setStatementWitness({ id: witnessId, nonce: Date.now() });
      setContextView("statement");
    },
    openHistory: (id) => {
      if (selectedEventId !== id) select(id);
      setOverrideFocusId(id);
      setContextView("history");
    },
    notify: setToast,
    transcript: transcriptFor(
      mode,
      resolved.sceneId,
      layers.map((layer) => layer.id),
    ),
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
        <div className="rui panel panel--docked" ref={panelRef}>
          <WitnessStrip graph={resolved} statusOf={statusOf} openStatement={context.openStatement} filter={context.witnessFilter} />
          <PanelHeader
            tabs={TABS.map((t) => ({ id: t.id, label: t.label, count: t.count?.(context) }))}
            activeTab={tab.id}
            onTab={setActiveTab}
            graph={resolved}
            selectedEventId={selectedEventId}
            placeOf={context.placeOf}
            timeBasisOf={context.timeBasisOf}
            actorColorOf={context.actorColorOf}
            showSelection={tab.id === "events"}
            onJump={jumpTo}
          />

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
        onClose={() => {
          setContextView(null);
          setOverrideFocusId(null);
        }}
        context={context}
        focusSourceId={focusSourceId}
        overrideFocusId={overrideFocusId}
        historyAccent={selectedEvent !== null && statusOf(selectedEvent) === "overridden"}
        preferredWitness={statementWitness}
      />
    </>
  );
}
