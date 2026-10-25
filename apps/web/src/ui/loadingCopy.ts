export const LABELING_COPY = "Labeling: no events in this view";
export const LOADING_COPY = "Loading the reconstruction…";

export function loadingCopy(graphless: boolean): string {
  return graphless ? LABELING_COPY : LOADING_COPY;
}
