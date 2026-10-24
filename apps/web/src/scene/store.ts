import type { ResolvedGraph } from "@rashomon/engine";
import type { Status } from "@rashomon/schema";
import { create } from "zustand";
import type { CameraPreset } from "./cameras/presets";

export type SceneStatus = "loading" | "ready" | "error";

export type StatusMap = Readonly<Record<string, Status>>;

export type GraphSnapshot = {
  readonly resolved: ResolvedGraph | null;
  readonly statuses: StatusMap;
};

export const DEFAULT_SPEED = 1;
const EMPTY_STATUSES: StatusMap = {};

export type SceneState = {
  preset: CameraPreset;
  poseResetCount: number;
  debugVisible: boolean;
  fps: number;
  floorHit: readonly [number, number, number] | null;
  status: SceneStatus;
  t: number;
  playing: boolean;
  speed: number;
  duration: number;
  resolved: ResolvedGraph | null;
  statuses: StatusMap;
  actorsReady: boolean;
  setPreset: (preset: CameraPreset) => void;
  toggleDebug: () => void;
  setFps: (fps: number) => void;
  setFloorHit: (hit: readonly [number, number, number] | null) => void;
  setStatus: (status: SceneStatus) => void;
  setT: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  play: () => void;
  pause: () => void;
  setResolved: (resolved: ResolvedGraph | null) => void;
  setGraph: (snapshot: GraphSnapshot) => void;
  setActorsReady: (ready: boolean) => void;
};

function durationOf(resolved: ResolvedGraph | null): number {
  const duration = resolved?.durationS ?? 0;
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

export const useSceneStore = create<SceneState>((set) => ({
  preset: "overview",
  poseResetCount: 0,
  debugVisible: false,
  fps: 0,
  floorHit: null,
  status: "loading",
  t: 0,
  playing: false,
  speed: DEFAULT_SPEED,
  duration: 0,
  resolved: null,
  statuses: EMPTY_STATUSES,
  actorsReady: false,
  setPreset: (preset) => set((state) => ({ preset, poseResetCount: state.poseResetCount + 1 })),
  toggleDebug: () => set((state) => ({ debugVisible: !state.debugVisible })),
  setFps: (fps) => set({ fps }),
  setFloorHit: (floorHit) => set({ floorHit }),
  setStatus: (status) => set({ status }),
  setT: (t) => set({ t: Number.isFinite(t) ? Math.max(0, t) : 0 }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed: Number.isFinite(speed) && speed > 0 ? speed : DEFAULT_SPEED }),
  play: () => set((state) => ({ playing: true, t: state.duration > 0 && state.t >= state.duration ? 0 : state.t })),
  pause: () => set({ playing: false }),
  setResolved: (resolved) => set({ resolved, statuses: EMPTY_STATUSES, duration: durationOf(resolved) }),
  setGraph: ({ resolved, statuses }) => set({ resolved, statuses, duration: durationOf(resolved) }),
  setActorsReady: (actorsReady) => set({ actorsReady }),
}));
