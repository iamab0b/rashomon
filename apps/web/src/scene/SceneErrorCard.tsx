import { useSceneStatus } from "./useSceneStatus";

const HINT = "Open / to load the store scene";

const layerStyle = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
} as const;

const cardStyle = {
  maxWidth: 360,
  padding: "14px 18px",
  color: "#f2f5f8",
  background: "rgba(11, 13, 16, 0.92)",
  border: "1px solid #ff4d4f",
  borderRadius: 6,
  font: "13px/1.5 system-ui, sans-serif",
  textAlign: "center",
} as const;

export function SceneErrorCard() {
  const { status, error } = useSceneStatus();
  if (status !== "error") return null;
  return (
    <div style={layerStyle}>
      <div role="alert" style={cardStyle}>
        <div style={{ fontWeight: 600 }}>{error ?? "The scene could not be loaded"}</div>
        <div style={{ color: "#9aa7bd", marginTop: 4 }}>{HINT}</div>
      </div>
    </div>
  );
}
