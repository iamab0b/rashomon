import type { Patch } from "@rashomon/schema";
import { useSceneStore } from "../store";
import type { FixtureGraphSource, GraphSource } from "./graphSource";

export type GraphActions = {
  readonly applyPatches: (patches: readonly Patch[]) => void;
};

function isPatchable(source: GraphSource): source is FixtureGraphSource {
  return source.kind === "fixture" && typeof (source as Partial<FixtureGraphSource>).apply === "function";
}

function applyToMountedSource(patches: readonly Patch[]): void {
  const source = useSceneStore.getState().graphSource;
  if (!source) throw new Error("patches rejected: no graph source is mounted");
  if (!isPatchable(source)) throw new Error(`patches rejected: the ${source.kind} graph source does not apply patches locally`);
  source.apply(patches);
}

const GRAPH_ACTIONS: GraphActions = { applyPatches: applyToMountedSource };

export function useGraphActions(): GraphActions {
  return GRAPH_ACTIONS;
}
