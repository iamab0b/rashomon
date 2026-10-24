import { useEffect } from "react";
import { isCameraPreset, Scene, useCamera } from "./scene";

const PANEL_WIDTH_PX = 360;

export function App() {
  const params = new URLSearchParams(window.location.search);
  const fixture = params.get("fixture") ?? "store";
  const debug = params.get("debug") ?? undefined;
  const cam = params.get("cam");
  const tParam = params.get("t");
  const t = tParam !== null && Number.isFinite(Number(tParam)) ? Number(tParam) : undefined;
  const { setPreset } = useCamera();

  useEffect(() => {
    if (isCameraPreset(cam)) setPreset(cam);
  }, [cam, setPreset]);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <div style={{ flex: 1 }}>
        <Scene fixture={fixture} debug={debug} t={t} />
      </div>
      <div
        style={{
          width: PANEL_WIDTH_PX,
          borderLeft: "1px solid #222831",
          color: "#c9d1d9",
          padding: 16,
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}
