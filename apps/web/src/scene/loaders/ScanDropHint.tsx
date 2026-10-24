const hintStyle = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(11, 13, 16, 0.6)",
  border: "2px dashed #6b7686",
  color: "#f2f5f8",
  font: "14px/1.5 system-ui, sans-serif",
  pointerEvents: "none",
  zIndex: 30,
} as const;

export function ScanDropHint() {
  return <div style={hintStyle}>Drop a GLB to load it as the scene. It stays in this browser.</div>;
}
