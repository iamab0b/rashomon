import { useSceneStore } from "../store";
import { CAMERA_PRESETS, type CameraPreset } from "./presets";

export type CameraApi = {
  preset: CameraPreset;
  setPreset: (preset: CameraPreset) => void;
  isPov: boolean;
};

export function useCamera(): CameraApi {
  const preset = useSceneStore((state) => state.preset);
  const setPreset = useSceneStore((state) => state.setPreset);
  return { preset, setPreset, isPov: CAMERA_PRESETS[preset].isPov };
}
