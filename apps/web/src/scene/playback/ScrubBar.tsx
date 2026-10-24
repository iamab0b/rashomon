import { useTimeline } from "./useTimeline";

const SCRUB_STEP_S = 0.01;

const barStyle = {
  position: "absolute",
  left: 12,
  right: 12,
  bottom: 12,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 10px",
  background: "rgba(11, 13, 16, 0.85)",
  border: "1px solid #222831",
  borderRadius: 6,
  color: "#c9d1d9",
  font: "12px/1.4 ui-monospace, monospace",
  zIndex: 30,
} as const;

const buttonStyle = {
  minWidth: 64,
  padding: "4px 10px",
  background: "#1c2330",
  color: "#e6edf3",
  border: "1px solid #30363d",
  borderRadius: 4,
  cursor: "pointer",
  font: "inherit",
} as const;

export function ScrubBar() {
  const { t, playing, duration, setT, play, pause } = useTimeline();
  if (duration <= 0) return null;
  return (
    <div style={barStyle}>
      <button type="button" style={buttonStyle} onClick={playing ? pause : play}>
        {playing ? "Pause" : "Play"}
      </button>
      <input
        type="range"
        aria-label="Timeline"
        min={0}
        max={duration}
        step={SCRUB_STEP_S}
        value={Math.min(t, duration)}
        onChange={(event) => setT(Number(event.currentTarget.value))}
        style={{ flex: 1 }}
      />
      <span>
        {t.toFixed(2)} / {duration.toFixed(1)} s
      </span>
    </div>
  );
}
