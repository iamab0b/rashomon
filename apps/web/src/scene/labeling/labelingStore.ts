import type { Interior, Landmark, SceneManifest } from "@rashomon/schema";
import { create } from "zustand";
import { boxFromClick, boxOfLandmark, moveBox, resizeBox, withBox, type BoxSize } from "./boxes";
import { idForLabel, parseAliases } from "./ids";
import { DEFAULT_KIND, defaultOccludes, type LandmarkKind } from "./kinds";
import { landmarkErrors } from "./landmarkErrors";
import { buildManifest, saveManifest, type ManifestStorage } from "./storage";

export type LandmarkEntry = {
  key: number;
  idAuto: boolean;
  landmark: Landmark;
};

export type MeshSwitch = { ok: true; key: string | null } | { ok: false; error: string };

export type MeshSwitcher = (manifest: SceneManifest) => Promise<MeshSwitch>;

export type SessionAction = "begin" | "reset" | "keep";

export function sessionAction(current: string | null, key: string | null): SessionAction {
  if (key === null) return "keep";
  if (current === null) return "begin";
  return current === key ? "keep" : "reset";
}

export function snapshotOf(landmarks: readonly Landmark[]): string {
  return JSON.stringify(landmarks);
}

export type LabelingState = {
  base: SceneManifest | null;
  sessionKey: string | null;
  snapshot: string;
  meshSwitcher: MeshSwitcher | null;
  interior: Interior | undefined;
  entries: LandmarkEntry[];
  nextKey: number;
  selectedKey: number | null;
  message: string | null;
  begin: (manifest: SceneManifest, key?: string | null) => void;
  load: (manifest: SceneManifest, key?: string | null) => void;
  setMeshSwitcher: (switcher: MeshSwitcher | null) => void;
  isDirty: () => boolean;
  setInterior: (interior: Interior | undefined) => void;
  addAt: (point: readonly [number, number, number]) => void;
  select: (key: number | null) => void;
  setLabel: (key: number, label: string) => void;
  setId: (key: number, id: string) => void;
  setAliases: (key: number, text: string) => void;
  setKind: (key: number, kind: LandmarkKind) => void;
  setOccludes: (key: number, occludes: boolean) => void;
  setSize: (key: number, size: Partial<BoxSize>) => void;
  moveTo: (key: number, cx: number, cz: number) => void;
  remove: (key: number) => void;
  setMessage: (message: string | null) => void;
  landmarks: () => Landmark[];
  toManifest: () => SceneManifest | null;
  save: (storage?: ManifestStorage | null) => boolean;
};

function patchEntry(entries: LandmarkEntry[], key: number, change: (entry: LandmarkEntry) => LandmarkEntry): LandmarkEntry[] {
  return entries.map((entry) => (entry.key === key ? change(entry) : entry));
}

function patchLandmark(entries: LandmarkEntry[], key: number, change: (landmark: Landmark) => Landmark): LandmarkEntry[] {
  return patchEntry(entries, key, (entry) => ({ ...entry, landmark: change(entry.landmark) }));
}

function entriesOf(landmarks: readonly Landmark[], firstKey: number): LandmarkEntry[] {
  return landmarks.map((source, index) => {
    const landmark = structuredClone(source);
    const others = landmarks.filter((_, other) => other !== index).map((other) => other.id);
    return { key: firstKey + index, idAuto: landmark.id === idForLabel(landmark.label, others), landmark };
  });
}

function nextNumber(entries: readonly LandmarkEntry[]): number {
  let n = entries.length + 1;
  while (entries.some((entry) => entry.landmark.id === `landmark_${n}`)) n += 1;
  return n;
}

function sameMesh(a: SceneManifest | null, b: SceneManifest): boolean {
  return a !== null && a.sceneId === b.sceneId && a.meshUrl === b.meshUrl;
}

export const useLabelingStore = create<LabelingState>((set, get) => ({
  base: null,
  sessionKey: null,
  snapshot: snapshotOf([]),
  meshSwitcher: null,
  interior: undefined,
  entries: [],
  nextKey: 1,
  selectedKey: null,
  message: null,
  begin: (manifest, key = null) =>
    set((state) => {
      if (state.base) return state;
      const entries = entriesOf(manifest.landmarks, state.nextKey);
      return {
        base: manifest,
        sessionKey: key,
        snapshot: snapshotOf(entries.map((entry) => entry.landmark)),
        interior: manifest.interior,
        entries,
        nextKey: state.nextKey + manifest.landmarks.length,
      };
    }),
  load: (manifest, key) =>
    set((state) => {
      const entries = entriesOf(manifest.landmarks, state.nextKey);
      return {
        base: manifest,
        sessionKey: key === undefined ? state.sessionKey : key,
        snapshot: snapshotOf(entries.map((entry) => entry.landmark)),
        interior: manifest.interior ?? (sameMesh(state.base, manifest) ? state.interior : undefined),
        entries,
        nextKey: state.nextKey + manifest.landmarks.length,
        selectedKey: null,
        message: null,
      };
    }),
  setMeshSwitcher: (meshSwitcher) => set({ meshSwitcher }),
  isDirty: () => snapshotOf(get().landmarks()) !== get().snapshot,
  setInterior: (interior) => set({ interior }),
  addAt: (point) =>
    set((state) => {
      const n = nextNumber(state.entries);
      const label = `Landmark ${n}`;
      const blank: Landmark = {
        id: idForLabel(label, state.entries.map((entry) => entry.landmark.id)),
        label,
        aliases: [],
        position: [0, 0, 0],
        bounds: { min: [0, 0, 0], max: [0, 0, 0] },
        kind: DEFAULT_KIND,
        occludes: defaultOccludes(DEFAULT_KIND),
      };
      const entry: LandmarkEntry = { key: state.nextKey, idAuto: true, landmark: withBox(blank, boxFromClick(point)) };
      return { entries: [...state.entries, entry], nextKey: state.nextKey + 1, selectedKey: entry.key, message: null };
    }),
  select: (selectedKey) => set({ selectedKey }),
  setLabel: (key, label) =>
    set((state) => {
      const taken = state.entries.filter((entry) => entry.key !== key).map((entry) => entry.landmark.id);
      return {
        entries: patchEntry(state.entries, key, (entry) => ({
          ...entry,
          landmark: {
            ...entry.landmark,
            label,
            id: entry.idAuto && label.trim() !== "" ? idForLabel(label, taken) : entry.landmark.id,
          },
        })),
      };
    }),
  setId: (key, id) =>
    set((state) => ({ entries: patchEntry(state.entries, key, (entry) => ({ ...entry, idAuto: false, landmark: { ...entry.landmark, id } })) })),
  setAliases: (key, text) =>
    set((state) => ({ entries: patchLandmark(state.entries, key, (landmark) => ({ ...landmark, aliases: parseAliases(text) })) })),
  setKind: (key, kind) =>
    set((state) => ({
      entries: patchLandmark(state.entries, key, (landmark) => ({ ...landmark, kind, occludes: defaultOccludes(kind) })),
    })),
  setOccludes: (key, occludes) =>
    set((state) => ({ entries: patchLandmark(state.entries, key, (landmark) => ({ ...landmark, occludes })) })),
  setSize: (key, size) =>
    set((state) => ({
      entries: patchLandmark(state.entries, key, (landmark) => withBox(landmark, resizeBox(boxOfLandmark(landmark), size))),
    })),
  moveTo: (key, cx, cz) =>
    set((state) => ({
      entries: patchLandmark(state.entries, key, (landmark) => withBox(landmark, moveBox(boxOfLandmark(landmark), cx, cz))),
    })),
  remove: (key) =>
    set((state) => ({
      entries: state.entries.filter((entry) => entry.key !== key),
      selectedKey: state.selectedKey === key ? null : state.selectedKey,
    })),
  setMessage: (message) => set({ message }),
  landmarks: () => get().entries.map((entry) => entry.landmark),
  toManifest: () => {
    const { base, interior } = get();
    return base ? buildManifest(base, get().landmarks(), interior) : null;
  },
  save: (storage) => {
    const manifest = get().toManifest();
    if (!manifest) return false;
    const errors = landmarkErrors(manifest.landmarks);
    if (errors.length > 0) {
      set({ message: errors[0] ?? null });
      return false;
    }
    const result = storage === undefined ? saveManifest(manifest) : saveManifest(manifest, storage);
    set({
      message: result.ok ? `Saved ${manifest.sceneId}` : result.error,
      ...(result.ok ? { snapshot: snapshotOf(manifest.landmarks) } : {}),
    });
    return result.ok;
  },
}));
