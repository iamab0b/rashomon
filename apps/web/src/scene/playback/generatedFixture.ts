import type { Patch } from "@rashomon/schema";
import type { GeneratedMotion } from "../characters/generated/loadGeneratedMotion";

export const GENERATED_SCENARIO = "generated";
export const GENERATED_FIXTURE_EVENT = "e8";
export const GENERATED_FIXTURE_VERB = "staggers";
export const GENERATED_FIXTURE_URL = "/generated/staggers.glb";

export const GENERATED_FIXTURE_MOTIONS: readonly GeneratedMotion[] = [
  {
    verb: GENERATED_FIXTURE_VERB,
    status: "ready",
    characterId: "fixture",
    motionId: GENERATED_FIXTURE_VERB,
    url: GENERATED_FIXTURE_URL,
  },
];

export function generatedFixturePatches(): readonly Patch[] {
  return [
    {
      op: "update_event",
      id: GENERATED_FIXTURE_EVENT,
      changes: { actionApproximated: true, verb: GENERATED_FIXTURE_VERB },
      sources: [],
    },
  ];
}
