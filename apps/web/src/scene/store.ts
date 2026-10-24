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
  selectedEventId: string | null;
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
  select: (id: string) => void;
  clear: () => void;
};

function clampT(t: number, duration: number): number {
  const lower = Number.isFinite(t) ? Math.max(0, t) : 0;
  return duration > 0 ? Math.min(lower, duration) : lower;
}

function survivingSelection(selected: string | null, resolved: ResolvedGraph | null): string | null {
  return selected !== null && resolved?.events.some((event) => event.id === selected) ? selected : null;
}

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
  selectedEventId: null,
  setPreset: (preset) => set((state) => ({ preset, poseResetCount: state.poseResetCount + 1 })),
  toggleDebug: () => set((state) => ({ debugVisible: !state.debugVisible })),
  setFps: (fps) => set({ fps }),
  setFloorHit: (floorHit) => set({ floorHit }),
  setStatus: (status) => set({ status }),
  setT: (t) => set((state) => ({ t: clampT(t, state.duration) })),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed: Number.isFinite(speed) && speed > 0 ? speed : DEFAULT_SPEED }),
  play: () => set((state) => ({ playing: true, t: state.duration > 0 && state.t >= state.duration ? 0 : state.t })),
  pause: () => set({ playing: false }),
  setResolved: (resolved) =>
    set((state) => {
      const duration = durationOf(resolved);
      return {
        resolved,
        statuses: EMPTY_STATUSES,
        duration,
        t: clampT(state.t, duration),
        selectedEventId: survivingSelection(state.selectedEventId, resolved),
      };
    }),
  setGraph: ({ resolved, statuses }) =>
    set((state) => {
      const duration = durationOf(resolved);
      return {
        resolved,
        statuses,
        duration,
        t: clampT(state.t, duration),
        selectedEventId: survivingSelection(state.selectedEventId, resolved),
      };
    }),
  setActorsReady: (actorsReady) => set({ actorsReady }),
  select: (id) => set((state) => ({ selectedEventId: survivingSelection(id, state.resolved) ?? state.selectedEventId })),
  clear: () => set({ selectedEventId: null }),
}));
