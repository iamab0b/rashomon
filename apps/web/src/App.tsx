import { useEffect } from "react";
import { Scene, useCamera } from "./scene";
import { isCameraPreset } from "./scene/cameras/presets";

const PANEL_WIDTH_PX = 360;

export function App() {
  const params = new URLSearchParams(window.location.search);
  const fixture = params.get("fixture") ?? undefined;
  const debug = params.get("debug") ?? undefined;
  const cam = params.get("cam");
  const { setPreset } = useCamera();

  useEffect(() => {
    if (isCameraPreset(cam)) setPreset(cam);
  }, [cam, setPreset]);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <div style={{ flex: 1 }}>
        <Scene fixture={fixture} debug={debug} />
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
