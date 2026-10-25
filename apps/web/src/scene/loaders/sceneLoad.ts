import type { SceneStatus } from "../store";
import { isKnownFixture, type LoadedScene } from "./scene";
import { unknownFixtureMessage } from "../sceneFailure";

export type SceneLoadSinks = {
  setLoaded: (loaded: LoadedScene | null) => void;
  setStatus: (status: SceneStatus, error?: string | null) => void;
};

export function beginSceneLoad(fixture: string, load: () => Promise<LoadedScene>, sinks: SceneLoadSinks): () => void {
  let cancelled = false;
  sinks.setLoaded(null);
  sinks.setStatus("loading");
  load()
    .then((result) => {
      if (!cancelled) sinks.setLoaded(result);
    })
    .catch((error: unknown) => {
      console.error("scene load failed", error);
      if (cancelled) return;
      const detail = error instanceof Error ? error.message : String(error);
      sinks.setStatus("error", isKnownFixture(fixture) ? `The scene could not be loaded: ${detail}` : unknownFixtureMessage(fixture));
    });
  return () => {
    cancelled = true;
  };
}
