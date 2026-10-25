import type { Landmark, SceneManifest } from "@rashomon/schema";

export type LabelingAdapter = {
  readonly addLandmark: (landmark: Landmark) => Landmark;
  readonly confirmedManifest: () => SceneManifest | null;
};

export type LabelingEntryLike = { key: number; idAuto: boolean; landmark: Landmark };

export type LabelingStateLike = {
  readonly entries: readonly LabelingEntryLike[];
  readonly nextKey: number;
  readonly toManifest: () => SceneManifest | null;
};

export type LabelingStoreLike = {
  readonly getState: () => LabelingStateLike;
  readonly setState: (partial: { entries: LabelingEntryLike[]; nextKey: number; selectedKey: number }) => void;
};

export type UniqueId = (base: string, taken: Iterable<string>) => string;

export function labelingAdapter(store: LabelingStoreLike, uniqueId: UniqueId): LabelingAdapter {
  return {
    addLandmark: (landmark) => {
      const { entries, nextKey } = store.getState();
      const confirmed: Landmark = { ...landmark, id: uniqueId(landmark.id, entries.map((entry) => entry.landmark.id)) };
      store.setState({ entries: [...entries, { key: nextKey, idAuto: false, landmark: confirmed }], nextKey: nextKey + 1, selectedKey: nextKey });
      return confirmed;
    },
    confirmedManifest: () => store.getState().toManifest(),
  };
}
