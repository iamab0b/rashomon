import type { Patch } from "@rashomon/schema";
import { useSceneStore } from "../store";
import type { SubmittedStatement } from "./statementStatus";
import type { GraphSource } from "./graphSource";

export type GraphActions = {
  readonly applyPatches: (patches: readonly Patch[]) => void;
  readonly submitStatement: (text: string, witnessName: string) => Promise<SubmittedStatement>;
};

type PatchableSource = GraphSource & { apply(patches: readonly Patch[]): void };

function isPatchable(source: GraphSource): source is PatchableSource {
  return typeof (source as Partial<PatchableSource>).apply === "function";
}

function applyToMountedSource(patches: readonly Patch[]): void {
  const source = useSceneStore.getState().graphSource;
  if (!source) throw new Error("patches rejected: no graph source is mounted");
  if (!isPatchable(source)) throw new Error(`patches rejected: the ${source.kind} graph source cannot apply patches`);
  source.apply(patches);
}

type StatementSource = GraphSource & { submitStatement(text: string, witnessName: string): Promise<SubmittedStatement> };

function canSubmit(source: GraphSource): source is StatementSource {
  return typeof (source as Partial<StatementSource>).submitStatement === "function";
}

function submitToMountedSource(text: string, witnessName: string): Promise<SubmittedStatement> {
  const source = useSceneStore.getState().graphSource;
  if (!source) throw new Error("statement rejected: no graph source is mounted");
  if (!canSubmit(source)) throw new Error(`statement rejected: the ${source.kind} graph source cannot take statements`);
  return source.submitStatement(text, witnessName);
}

const GRAPH_ACTIONS: GraphActions = { applyPatches: applyToMountedSource, submitStatement: submitToMountedSource };

export function useGraphActions(): GraphActions {
  return GRAPH_ACTIONS;
}
