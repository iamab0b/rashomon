import { useEffect } from "react";
import { isCameraPreset, POV_CAM, Scene, Timeline, useCamera } from "./scene";
import { RightPanel } from "./ui/RightPanel";
import { TopBar } from "./ui/TopBar";
import { ViewSwitcher } from "./ui/ViewSwitcher";

export function App() {
  const params = new URLSearchParams(window.location.search);
  const fixture = params.get("fixture") ?? "store";
  const debug = params.get("debug") ?? undefined;
  const cam = params.get("cam");
  const tParam = params.get("t");
  const t = tParam !== null && Number.isFinite(Number(tParam)) ? Number(tParam) : undefined;
  const { setPreset, setFollowing } = useCamera();

  useEffect(() => {
    if (isCameraPreset(cam)) setPreset(cam);
    if (cam === POV_CAM) setFollowing(true);
  }, [cam, setPreset, setFollowing]);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      <TopBar />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <Scene fixture={fixture} debug={debug} t={t} scrubBar={false} />
            <ViewSwitcher />
          </div>
          <Timeline />
        </div>
        <RightPanel />
      </div>
    </div>
  );
}
