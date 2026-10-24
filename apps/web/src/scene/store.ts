import { create } from "zustand";
import type { CameraPreset } from "./cameras/presets";

export type SceneStatus = "loading" | "ready" | "error";

export type SceneState = {
  preset: CameraPreset;
  poseResetCount: number;
  debugVisible: boolean;
  fps: number;
  floorHit: readonly [number, number, number] | null;
  status: SceneStatus;
  setPreset: (preset: CameraPreset) => void;
  toggleDebug: () => void;
  setFps: (fps: number) => void;
  setFloorHit: (hit: readonly [number, number, number] | null) => void;
  setStatus: (status: SceneStatus) => void;
};

export const useSceneStore = create<SceneState>((set) => ({
  preset: "overview",
  poseResetCount: 0,
  debugVisible: false,
  fps: 0,
  floorHit: null,
  status: "loading",
  setPreset: (preset) => set((state) => ({ preset, poseResetCount: state.poseResetCount + 1 })),
  toggleDebug: () => set((state) => ({ debugVisible: !state.debugVisible })),
  setFps: (fps) => set({ fps }),
  setFloorHit: (floorHit) => set({ floorHit }),
  setStatus: (status) => set({ status }),
}));
