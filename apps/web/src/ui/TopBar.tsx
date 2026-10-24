import { useEffect, useState } from "react";
import { useGraph } from "../scene";
import { GRAPH_MODES, parseMode, searchWithMode, type GraphMode } from "./graphMode";
import "./rashomon-ui.css";

const SCENE_LABELS: Record<string, string> = { store_v1: "Corner Store" };

const MODE_LABELS: Record<GraphMode, string> = { fixture: "Fixture", live: "Live" };

export function useGraphMode(): [GraphMode, (mode: GraphMode) => void] {
  const [mode, setModeState] = useState<GraphMode>(() => parseMode(window.location.search));

  useEffect(() => {
    const onPop = () => setModeState(parseMode(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setMode = (next: GraphMode) => {
    const { pathname, search, hash } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${searchWithMode(search, next)}${hash}`);
    setModeState(next);
  };

  return [mode, setMode];
}

function ModeBadge({ mode, liveConnected }: { mode: GraphMode; liveConnected: boolean }) {
  if (mode === "fixture") return <span className="badge badge--amber">Fixture data</span>;
  if (liveConnected) return <span className="badge badge--green">Live</span>;
  return (
    <span className="badge badge--red" title="No live backend yet; the scene is still playing the fixture">
      Live · not connected
    </span>
  );
}

export function TopBar({ liveConnected = false }: { liveConnected?: boolean }) {
  const { resolved } = useGraph();
  const [mode, setMode] = useGraphMode();
  const sceneId = resolved?.sceneId;
  const sceneLabel = sceneId ? (SCENE_LABELS[sceneId] ?? sceneId) : "Loading…";

  return (
    <header className="rui topbar">
      <div className="brand">
        <div className="brand-mark">R</div>
        <strong>Rashomon</strong>
        <div className="divider" />
        <span>{sceneLabel}</span>
        <ModeBadge mode={mode} liveConnected={liveConnected} />
      </div>
      <div className="top-actions">
        <span className="field-label" style={{ margin: 0 }}>
          Data
        </span>
        <div className="segmented" role="group" aria-label="Data source">
          {GRAPH_MODES.map((m) => (
            <button
              type="button"
              key={m}
              className={m === mode ? "active" : undefined}
              aria-pressed={m === mode}
              onClick={() => setMode(m)}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
