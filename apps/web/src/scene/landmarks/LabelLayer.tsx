import type { Landmark } from "@rashomon/schema";
import { registerLabel } from "./labelRegistry";

const layerStyle = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
} as const;

const labelStyle = {
  position: "absolute",
  left: 0,
  top: 0,
  display: "none",
  color: "#f2f5f8",
  background: "rgba(11, 13, 16, 0.78)",
  border: "1px solid rgba(255, 255, 255, 0.25)",
  borderRadius: 4,
  padding: "1px 6px",
  font: "12px/1.4 system-ui, sans-serif",
  whiteSpace: "nowrap",
  userSelect: "none",
} as const;

export function LabelLayer({ landmarks }: { landmarks: readonly Landmark[] }) {
  return (
    <div style={layerStyle}>
      {landmarks.map((landmark) => (
        <div
          key={landmark.id}
          ref={(element) => registerLabel(landmark.id, element)}
          style={labelStyle}
        >
          {landmark.label}
        </div>
      ))}
    </div>
  );
}
