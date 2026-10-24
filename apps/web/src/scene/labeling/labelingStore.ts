import type { Interior, Landmark, SceneManifest } from "@rashomon/schema";
import { create } from "zustand";
import { boxFromClick, boxOfLandmark, moveBox, resizeBox, withBox, type BoxSize } from "./boxes";
import { idForLabel, nextIdForLabel, parseAliases } from "./ids";
import { DEFAULT_KIND, defaultOccludes, type LandmarkKind } from "./kinds";
import { landmarkErrors } from "./landmarkErrors";
import { buildManifest, saveManifest, type ManifestStorage } from "./storage";

export type LabelingState = {
  base: SceneManifest | null;
  interior: Interior | undefined;
  landmarks: Landmark[];
  selectedId: string | null;
  message: string | null;
  begin: (manifest: SceneManifest) => void;
  load: (manifest: SceneManifest) => void;
  setInterior: (interior: Interior | undefined) => void;
  addAt: (point: readonly [number, number, number]) => void;
  select: (id: string | null) => void;
  setLabel: (id: string, label: string) => void;
  setId: (id: string, nextId: string) => void;
  setAliases: (id: string, text: string) => void;
  setKind: (id: string, kind: LandmarkKind) => void;
  setOccludes: (id: string, occludes: boolean) => void;
  setSize: (id: string, size: Partial<BoxSize>) => void;
  moveTo: (id: string, cx: number, cz: number) => void;
  remove: (id: string) => void;
  setMessage: (message: string | null) => void;
  toManifest: () => SceneManifest | null;
  save: (storage?: ManifestStorage | null) => boolean;
};

function patchLandmark(landmarks: Landmark[], id: string, change: (landmark: Landmark) => Landmark): Landmark[] {
  return landmarks.map((landmark) => (landmark.id === id ? change(landmark) : landmark));
}

function nextNumber(landmarks: readonly Landmark[]): number {
  let n = landmarks.length + 1;
  while (landmarks.some((landmark) => landmark.id === `landmark_${n}`)) n += 1;
  return n;
}

export const useLabelingStore = create<LabelingState>((set, get) => ({
  base: null,
  interior: undefined,
  landmarks: [],
  selectedId: null,
  message: null,
  begin: (manifest) =>
    set((state) => (state.base ? state : { base: manifest, interior: manifest.interior, landmarks: structuredClone(manifest.landmarks) })),
  load: (manifest) =>
    set({
      base: manifest,
      interior: manifest.interior,
      landmarks: structuredClone(manifest.landmarks),
      selectedId: null,
      message: null,
    }),
  setInterior: (interior) => set({ interior }),
  addAt: (point) =>
    set((state) => {
      const n = nextNumber(state.landmarks);
      const label = `Landmark ${n}`;
      const base: Landmark = {
        id: idForLabel(label, state.landmarks.map((landmark) => landmark.id)),
        label,
        aliases: [],
        position: [0, 0, 0],
        bounds: { min: [0, 0, 0], max: [0, 0, 0] },
        kind: DEFAULT_KIND,
        occludes: defaultOccludes(DEFAULT_KIND),
      };
      const landmark = withBox(base, boxFromClick(point));
      return { landmarks: [...state.landmarks, landmark], selectedId: landmark.id, message: null };
    }),
  select: (selectedId) => set({ selectedId }),
  setLabel: (id, label) =>
    set((state) => {
      const target = state.landmarks.find((landmark) => landmark.id === id);
      if (!target) return state;
      const taken = state.landmarks.filter((landmark) => landmark.id !== id).map((landmark) => landmark.id);
      const nextId = nextIdForLabel(id, target.label, label, taken);
      return {
        landmarks: patchLandmark(state.landmarks, id, (landmark) => ({ ...landmark, id: nextId, label })),
        selectedId: state.selectedId === id ? nextId : state.selectedId,
      };
    }),
  setId: (id, nextId) =>
    set((state) => ({
      landmarks: patchLandmark(state.landmarks, id, (landmark) => ({ ...landmark, id: nextId })),
      selectedId: state.selectedId === id ? nextId : state.selectedId,
    })),
  setAliases: (id, text) =>
    set((state) => ({ landmarks: patchLandmark(state.landmarks, id, (landmark) => ({ ...landmark, aliases: parseAliases(text) })) })),
  setKind: (id, kind) =>
    set((state) => ({
      landmarks: patchLandmark(state.landmarks, id, (landmark) => ({ ...landmark, kind, occludes: defaultOccludes(kind) })),
    })),
  setOccludes: (id, occludes) =>
    set((state) => ({ landmarks: patchLandmark(state.landmarks, id, (landmark) => ({ ...landmark, occludes })) })),
  setSize: (id, size) =>
    set((state) => ({
      landmarks: patchLandmark(state.landmarks, id, (landmark) => withBox(landmark, resizeBox(boxOfLandmark(landmark), size))),
    })),
  moveTo: (id, cx, cz) =>
    set((state) => ({
      landmarks: patchLandmark(state.landmarks, id, (landmark) => withBox(landmark, moveBox(boxOfLandmark(landmark), cx, cz))),
    })),
  remove: (id) =>
    set((state) => ({
      landmarks: state.landmarks.filter((landmark) => landmark.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),
  setMessage: (message) => set({ message }),
  toManifest: () => {
    const { base, landmarks, interior } = get();
    return base ? buildManifest(base, landmarks, interior) : null;
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
    set({ message: result.ok ? `Saved ${manifest.sceneId}` : result.error });
    return result.ok;
  },
}));
