import { create } from "zustand";
import type { CameraPreset } from "./cameras/presets";

export type SceneState = {
  preset: CameraPreset;
  debugVisible: boolean;
  fps: number;
  floorHit: readonly [number, number, number] | null;
  ready: boolean;
  setPreset: (preset: CameraPreset) => void;
  toggleDebug: () => void;
  setFps: (fps: number) => void;
  setFloorHit: (hit: readonly [number, number, number] | null) => void;
  setReady: (ready: boolean) => void;
};

export const useSceneStore = create<SceneState>((set) => ({
  preset: "overview",
  debugVisible: false,
  fps: 0,
  floorHit: null,
  ready: false,
  setPreset: (preset) => set({ preset }),
  toggleDebug: () => set((state) => ({ debugVisible: !state.debugVisible })),
  setFps: (fps) => set({ fps }),
  setFloorHit: (floorHit) => set({ floorHit }),
  setReady: (ready) => set({ ready }),
}));
