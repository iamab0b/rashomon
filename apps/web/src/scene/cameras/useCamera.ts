import { useSceneStore, type SceneState } from "../store";
import { CAMERA_PRESETS, type CameraPreset } from "./presets";

export type CameraApi = {
  preset: CameraPreset;
  setPreset: (preset: CameraPreset) => void;
  isPov: boolean;
  following: boolean;
  povActor: string | null;
  togglePov: () => void;
  setFollowing: (following: boolean) => void;
  setPovActor: (actorId: string | null) => void;
};

export function isPovActive(state: Pick<SceneState, "preset" | "povFollow">): boolean {
  return state.povFollow || CAMERA_PRESETS[state.preset].isPov;
}

export function useCamera(): CameraApi {
  const preset = useSceneStore((state) => state.preset);
  const setPreset = useSceneStore((state) => state.setPreset);
  const following = useSceneStore((state) => state.povFollow);
  const povActor = useSceneStore((state) => state.povActor);
  const togglePov = useSceneStore((state) => state.togglePov);
  const setFollowing = useSceneStore((state) => state.setPovFollow);
  const setPovActor = useSceneStore((state) => state.setPovActor);
  return {
    preset,
    setPreset,
    isPov: following || CAMERA_PRESETS[preset].isPov,
    following,
    povActor,
    togglePov,
    setFollowing,
    setPovActor,
  };
}
