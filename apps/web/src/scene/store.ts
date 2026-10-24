import type { ResolvedGraph } from "@rashomon/engine";
import type { EventGraph, Status } from "@rashomon/schema";
import { create } from "zustand";
import type { CameraPreset } from "./cameras/presets";
import type { CharacterHandle } from "./characters/Character";
import type { GraphSource } from "./playback/graphSource";
import { NO_STATEMENTS, type StatementStatuses } from "./playback/statementStatus";

export type SceneStatus = "loading" | "ready" | "error";

export type StatusMap = Readonly<Record<string, Status>>;

export type GraphSnapshot = {
  readonly resolved: ResolvedGraph | null;
  readonly statuses: StatusMap;
  readonly graph?: EventGraph | null;
};

export const DEFAULT_SPEED = 1;
const EMPTY_STATUSES: StatusMap = {};

export type GraphErrors = {
  readonly connection: string | null;
  readonly action: string | null;
};

export type SceneState = {
  preset: CameraPreset;
  poseResetCount: number;
  debugVisible: boolean;
  fps: number;
  floorHit: readonly [number, number, number] | null;
  status: SceneStatus;
  error: string | null;
  t: number;
  playing: boolean;
  speed: number;
  duration: number;
  resolved: ResolvedGraph | null;
  statuses: StatusMap;
  graph: EventGraph | null;
  graphSource: GraphSource | null;
  connectionError: string | null;
  actionError: string | null;
  errorEpoch: number;
  liveIdentity: string | null;
  statements: StatementStatuses;
  actorsReady: boolean;
  characterHandles: ReadonlyMap<string, CharacterHandle>;
  selectedEventId: string | null;
  povFollow: boolean;
  povActor: string | null;
  dimmedActors: ReadonlySet<string>;
  dimmedMeshes: ReadonlySet<string>;
  setPreset: (preset: CameraPreset) => void;
  toggleDebug: () => void;
  setFps: (fps: number) => void;
  setFloorHit: (hit: readonly [number, number, number] | null) => void;
  setStatus: (status: SceneStatus, error?: string | null) => void;
  setT: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  play: () => void;
  pause: () => void;
  setResolved: (resolved: ResolvedGraph | null) => void;
  setGraph: (snapshot: GraphSnapshot) => void;
  setGraphSource: (source: GraphSource | null) => void;
  setGraphErrors: (errors: GraphErrors) => void;
  setLiveIdentity: (identity: string | null) => void;
  setStatements: (statements: StatementStatuses) => void;
  setActionError: (message: string | null) => void;
  setActorsReady: (ready: boolean) => void;
  setCharacterHandle: (actorId: string, handle: CharacterHandle | null) => void;
  select: (id: string) => void;
  clear: () => void;
  setPovFollow: (follow: boolean) => void;
  togglePov: () => void;
  setPovActor: (actorId: string | null) => void;
  setDimmedActors: (actorIds: ReadonlySet<string>) => void;
  setDimmedMeshes: (names: ReadonlySet<string>) => void;
};

const NO_ACTORS: ReadonlySet<string> = new Set();
const NO_HANDLES: ReadonlyMap<string, CharacterHandle> = new Map();

function sameMembers(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const member of a) if (!b.has(member)) return false;
  return true;
}

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
  error: null,
  t: 0,
  playing: false,
  speed: DEFAULT_SPEED,
  duration: 0,
  resolved: null,
  statuses: EMPTY_STATUSES,
  graph: null,
  graphSource: null,
  connectionError: null,
  actionError: null,
  errorEpoch: 0,
  liveIdentity: null,
  statements: NO_STATEMENTS,
  actorsReady: false,
  characterHandles: NO_HANDLES,
  selectedEventId: null,
  povFollow: false,
  povActor: null,
  dimmedActors: NO_ACTORS,
  dimmedMeshes: NO_ACTORS,
  setPreset: (preset) => set((state) => ({ preset, povFollow: false, poseResetCount: state.poseResetCount + 1 })),
  toggleDebug: () => set((state) => ({ debugVisible: !state.debugVisible })),
  setFps: (fps) => set({ fps }),
  setFloorHit: (floorHit) => set({ floorHit }),
  setStatus: (status, error = null) => set({ status, error: status === "error" ? error : null }),
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
        graph: null,
        duration,
        t: clampT(state.t, duration),
        selectedEventId: survivingSelection(state.selectedEventId, resolved),
      };
    }),
  setGraph: ({ resolved, statuses, graph }) =>
    set((state) => {
      const duration = durationOf(resolved);
      return {
        resolved,
        statuses,
        graph: graph ?? null,
        duration,
        t: clampT(state.t, duration),
        selectedEventId: survivingSelection(state.selectedEventId, resolved),
      };
    }),
  setGraphSource: (graphSource) => set({ graphSource }),
  setGraphErrors: ({ connection, action }) =>
    set((state) => ({ connectionError: connection, actionError: action, errorEpoch: state.errorEpoch + 1 })),
  setActionError: (actionError) => set({ actionError }),
  setLiveIdentity: (liveIdentity) => set((state) => (state.liveIdentity === liveIdentity ? state : { liveIdentity })),
  setStatements: (statements) => set((state) => (state.statements === statements ? state : { statements })),
  setActorsReady: (actorsReady) => set({ actorsReady }),
  setCharacterHandle: (actorId, handle) =>
    set((state) => {
      if (handle === null && !state.characterHandles.has(actorId)) return state;
      const next = new Map(state.characterHandles);
      if (handle === null) next.delete(actorId);
      else next.set(actorId, handle);
      return { characterHandles: next };
    }),
  select: (id) => set((state) => ({ selectedEventId: survivingSelection(id, state.resolved) ?? state.selectedEventId })),
  clear: () => set({ selectedEventId: null }),
  setPovFollow: (povFollow) =>
    set((state) => (povFollow ? { povFollow } : { povFollow, poseResetCount: state.poseResetCount + 1 })),
  togglePov: () =>
    set((state) => (state.povFollow ? { povFollow: false, poseResetCount: state.poseResetCount + 1 } : { povFollow: true })),
  setPovActor: (povActor) => set({ povActor }),
  setDimmedActors: (actorIds) =>
    set((state) => (sameMembers(state.dimmedActors, actorIds) ? state : { dimmedActors: new Set(actorIds) })),
  setDimmedMeshes: (names) =>
    set((state) => (sameMembers(state.dimmedMeshes, names) ? state : { dimmedMeshes: new Set(names) })),
}));
