import type { ResolvedGraph } from "@rashomon/engine";
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
  t: number;
  playing: boolean;
  resolved: ResolvedGraph | null;
  setPreset: (preset: CameraPreset) => void;
  toggleDebug: () => void;
  setFps: (fps: number) => void;
  setFloorHit: (hit: readonly [number, number, number] | null) => void;
  setStatus: (status: SceneStatus) => void;
  setT: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  setResolved: (resolved: ResolvedGraph | null) => void;
};

export const useSceneStore = create<SceneState>((set) => ({
  preset: "overview",
  poseResetCount: 0,
  debugVisible: false,
  fps: 0,
  floorHit: null,
  status: "loading",
  t: 0,
  playing: false,
  resolved: null,
  setPreset: (preset) => set((state) => ({ preset, poseResetCount: state.poseResetCount + 1 })),
  toggleDebug: () => set((state) => ({ debugVisible: !state.debugVisible })),
  setFps: (fps) => set({ fps }),
  setFloorHit: (floorHit) => set({ floorHit }),
  setStatus: (status) => set({ status }),
  setT: (t) => set({ t: Number.isFinite(t) ? Math.max(0, t) : 0 }),
  setPlaying: (playing) => set({ playing }),
  setResolved: (resolved) => set({ resolved }),
}));
