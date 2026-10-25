import { useEffect } from "react";
import { isCameraPreset, isLandmarkEditing, POV_CAM, Scene, Timeline, useCamera, useGraph } from "./scene";
import { RIGHT_SIDE_CLOSED_PX, RightPanel } from "./ui/RightPanel";
import { TopBar } from "./ui/TopBar";
import { ViewSwitcher } from "./ui/ViewSwitcher";
import { useActorFocus } from "./ui/actorFocus";

export function App() {
  const params = new URLSearchParams(window.location.search);
  const fixture = params.get("fixture") ?? "store";
  const debug = params.get("debug") ?? undefined;
  const cam = params.get("cam");
  const tParam = params.get("t");
  const t = tParam !== null && Number.isFinite(Number(tParam)) ? Number(tParam) : undefined;
  const editing = isLandmarkEditing(window.location.search);
  const { setPreset, setFollowing } = useCamera();
  const focusActor = useActorFocus((s) => s.actor);
  const drawerMounted = useGraph().resolved !== null;

  useEffect(() => {
    if (isCameraPreset(cam)) setPreset(cam);
    if (cam === POV_CAM) setFollowing(true);
  }, [cam, setPreset, setFollowing]);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      <TopBar />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            ["--rtl-min-width" as string]: `calc(100vw - ${RIGHT_SIDE_CLOSED_PX}px)`,
          }}
        >
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <Scene fixture={fixture} debug={debug} t={t} sceneToolsHosted={drawerMounted} />
            <ViewSwitcher />
          </div>
          {editing ? null : <Timeline focusActor={focusActor} />}
        </div>
        <RightPanel />
      </div>
    </div>
  );
}
