import { LabelingPanel } from "./labeling/LabelingPanel";
import { isEditorOpen } from "./labeling/storage";
import { ScanPanel } from "./loaders/ScanPanel";
import { useScanToolsStore } from "./loaders/scanToolsStore";

function currentSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

export function useSceneToolsAvailable(): boolean {
  const scanLoaded = useScanToolsStore((state) => state.scan !== null);
  return scanLoaded || isEditorOpen(currentSearch());
}

export function SceneTools() {
  const scan = useScanToolsStore((state) => state.scan);
  const editing = isEditorOpen(currentSearch());
  if (!scan && !editing) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-scene-tools="">
      {scan ? <ScanPanel scan={scan} /> : null}
      {editing ? <LabelingPanel /> : null}
    </div>
  );
}
