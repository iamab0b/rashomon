import { useEffect, useRef, useState } from "react";
import { useGraph } from "../scene";
import { GRAPH_MODES, type GraphMode } from "./graphMode";
import { Icon } from "./Icon";
import { useGraphMode } from "./useGraphMode";
import "./rashomon-ui.css";

const SCENE_LABELS: Record<string, string> = { store_v1: "Corner Store" };

const MODE_LABELS: Record<GraphMode, string> = { fixture: "Fixture", live: "Live" };

const TOAST_MS = 3200;

export const IMPORT_NOT_CONNECTED =
  "Transcript import is not connected in this demo. Use Fixture mode to explore the workspace.";

function ModeBadge({ mode, liveConnected }: { mode: GraphMode; liveConnected: boolean }) {
  if (mode === "fixture") return <span className="badge badge--amber">Fixture data</span>;
  if (liveConnected) return <span className="badge badge--green">Live</span>;
  return (
    <span className="badge badge--red" title="No live backend yet; the scene is still playing the fixture">
      Live · not connected
    </span>
  );
}

function AddSourceMenu({ onLoadFixture, onNotConnected }: { onLoadFixture: () => void; onNotConnected: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="add-source" ref={ref}>
      <button
        type="button"
        className="button button--quiet"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Add source
        <Icon name="chevron" size={12} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <button type="button" role="menuitem" onClick={choose(onLoadFixture)}>
            Load demo fixture
          </button>
          <button type="button" role="menuitem" className="menu-item--muted" onClick={choose(onNotConnected)}>
            Import transcript
            <span>Not connected</span>
          </button>
          <button type="button" role="menuitem" className="menu-item--muted" onClick={choose(onNotConnected)}>
            Paste transcript
            <span>Not connected</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBar({ liveConnected = false }: { liveConnected?: boolean }) {
  const { resolved } = useGraph();
  const [mode, setMode] = useGraphMode();
  const [toast, setToast] = useState("");
  const sceneId = resolved?.sceneId;
  const sceneLabel = sceneId ? (SCENE_LABELS[sceneId] ?? sceneId) : "Loading…";

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

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
        <AddSourceMenu
          onLoadFixture={() => {
            if (mode === "fixture") setToast("The demo fixture is loaded: Corner Store, one witness.");
            else setMode("fixture");
          }}
          onNotConnected={() => setToast(IMPORT_NOT_CONNECTED)}
        />
        <div className="divider" />
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
      {toast && (
        <div className="toast toast--info" role="status">
          {toast}
        </div>
      )}
    </header>
  );
}
