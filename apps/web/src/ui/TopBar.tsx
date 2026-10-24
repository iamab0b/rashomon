import { useGraph } from "../scene";
import { GRAPH_MODES, LEAVE_FIXTURE_WARNING, modeBadge, parseMode, searchWithMode, type GraphMode } from "./graphMode";
import "./rashomon-ui.css";

const SCENE_LABELS: Record<string, string> = { store_v1: "Corner Store" };

const MODE_LABELS: Record<GraphMode, string> = { fixture: "Fixture", live: "Live" };

export function useGraphMode(): [GraphMode, (mode: GraphMode) => void] {
  const { resolved } = useGraph();
  const mode = parseMode(window.location.search);
  const setMode = (next: GraphMode) => {
    if (next === mode) return;
    const hasOverrides = mode === "fixture" && resolved?.events.some((event) => event.override);
    if (hasOverrides && !window.confirm(LEAVE_FIXTURE_WARNING)) return;
    window.location.search = searchWithMode(window.location.search, next);
  };
  return [mode, setMode];
}

function ModeBadge({ mode, hasGraph }: { mode: GraphMode; hasGraph: boolean }) {
  const badge = modeBadge(mode, hasGraph);
  return <span className={`badge badge--${badge.tone}`}>{badge.label}</span>;
}

export function TopBar() {
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
        <ModeBadge mode={mode} hasGraph={resolved !== null} />
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
