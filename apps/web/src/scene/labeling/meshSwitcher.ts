import type { LoadedScan } from "../loaders/scan";
import { scanLocation, type ScanRequest } from "../loaders/scanRequest";
import type { SceneStatus } from "../store";
import type { MeshSwitcher } from "./labelingStore";

export type MeshSwitcherDeps = {
  getScan: () => LoadedScan | null;
  replace: (request: ScanRequest, meshUrl: string) => void;
  load: (request: ScanRequest) => Promise<Pick<LoadedScan, "meshUrl">>;
  getStatus: () => SceneStatus;
  setStatus: (status: SceneStatus, error?: string | null) => void;
  describe: (error: unknown) => string;
};

export function createMeshSwitcher(deps: MeshSwitcherDeps): MeshSwitcher {
  return async (manifest) => {
    const shown = deps.getScan();
    if (shown && manifest.meshUrl === shown.meshUrl) {
      if (deps.getStatus() === "error") deps.setStatus("ready");
      return { ok: true, key: `scan:${shown.meshUrl}` };
    }
    if (!shown && !manifest.meshUrl.startsWith("idb:")) return { ok: true, key: null };
    const request: ScanRequest = { scan: scanLocation(manifest.meshUrl), manifest: null };
    try {
      const preview = await deps.load(request);
      deps.replace(request, manifest.meshUrl);
      return { ok: true, key: `scan:${preview.meshUrl}` };
    } catch (error) {
      console.error("import mesh failed", error);
      deps.setStatus("error", deps.describe(error));
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };
}
