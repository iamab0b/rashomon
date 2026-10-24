import { useSceneStore, type SceneStatus } from "./store";

export type SceneStatusView = {
  readonly status: SceneStatus;
  readonly error: string | null;
};

export function useSceneStatus(): SceneStatusView {
  const status = useSceneStore((state) => state.status);
  const error = useSceneStore((state) => state.error);
  return { status, error };
}
