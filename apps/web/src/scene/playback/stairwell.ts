import type { EventGraph, Patch } from "@rashomon/schema";
import stairwellJson from "../../../../../packages/schema/fixtures/stairwell.graph.json";

type StairwellJson = EventGraph & { correctionPatch: { patches: Patch[] } };

export const stairwellGraph = stairwellJson as unknown as StairwellJson;

export function stairwellCorrectionPatches(): readonly Patch[] {
  return stairwellGraph.correctionPatch.patches;
}
