import { useSceneStore } from "../store";
import type { SceneSource } from "./sceneSource";

export function useSceneSource(): SceneSource | null {
  return useSceneStore((state) => state.sceneSource);
}
