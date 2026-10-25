import type { SceneManifest } from "@rashomon/schema";
import { useLabelingStore } from "./labelingStore";

export async function applyManifest(manifest: SceneManifest, store: typeof useLabelingStore = useLabelingStore): Promise<boolean> {
  const switcher = store.getState().meshSwitcher;
  if (!switcher) {
    store.getState().load(manifest);
    return true;
  }
  const outcome = await switcher(manifest);
  if (!outcome.ok) {
    store.getState().setMessage(`Import refused: ${outcome.error}`);
    return false;
  }
  store.getState().load(manifest, outcome.key ?? undefined);
  return true;
}
