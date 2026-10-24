import { useEffect, useState } from "react";
import { useCamera } from "../cameras/useCamera";
import { useSceneStore } from "../store";
import { buildShotPayload, isShotDisabled, SHOT_DISABLED_TOOLTIP } from "./shotPayload";

const RESULT_VISIBLE_MS = 5000;

const containerStyle = {
  position: "absolute",
  top: 8,
  right: 8,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 4,
} as const;

const buttonStyle = {
  color: "#f2f5f8",
  background: "rgba(11, 13, 16, 0.78)",
  border: "1px solid rgba(255, 255, 255, 0.25)",
  borderRadius: 4,
  padding: "2px 10px",
  font: "12px/1.4 system-ui, sans-serif",
  cursor: "pointer",
} as const;

const resultStyle = {
  maxWidth: 360,
  color: "#f2f5f8",
  background: "rgba(11, 13, 16, 0.78)",
  borderRadius: 4,
  padding: "1px 6px",
  font: "11px/1.4 system-ui, sans-serif",
  wordBreak: "break-all",
  userSelect: "text",
} as const;

type Outcome = { readonly kind: "path" | "error"; readonly text: string };

async function requestShot(body: unknown): Promise<Outcome> {
  try {
    const response = await fetch("/__shot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as { path?: string; error?: string };
    if (response.ok && json.path) return { kind: "path", text: json.path };
    return { kind: "error", text: json.error ?? `shot failed (${response.status})` };
  } catch (error) {
    return { kind: "error", text: error instanceof Error ? error.message : "shot request failed" };
  }
}

export function ShotButton() {
  const { preset, following } = useCamera();
  const t = useSceneStore((state) => state.t);
  const source = useSceneStore((state) => state.graphSource);
  useSceneStore((state) => state.resolved);
  const [capturing, setCapturing] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const disabled = capturing || isShotDisabled(window.location.search, source);

  useEffect(() => {
    if (!outcome) return;
    const timer = setTimeout(() => setOutcome(null), RESULT_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [outcome]);

  const capture = () => {
    setCapturing(true);
    setOutcome(null);
    requestShot(buildShotPayload({ search: window.location.search, preset, following, t })).then((result) => {
      setOutcome(result);
      setCapturing(false);
    });
  };

  return (
    <div style={containerStyle} data-shot-control="">
      <button
        type="button"
        style={{ ...buttonStyle, opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
        disabled={disabled}
        title={!capturing && disabled ? SHOT_DISABLED_TOOLTIP : undefined}
        onClick={capture}
      >
        {capturing ? "Capturing…" : "Shot"}
      </button>
      {outcome ? (
        <div style={{ ...resultStyle, color: outcome.kind === "error" ? "#ff8a80" : resultStyle.color }}>{outcome.text}</div>
      ) : null}
    </div>
  );
}
