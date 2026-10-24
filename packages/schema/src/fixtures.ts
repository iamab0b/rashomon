import storeJson from "../fixtures/store.scene.json";
import robberyJson from "../fixtures/robbery.graph.json";
import robberyResolvedJson from "../fixtures/robbery.resolved.json";
import robberyClerkJson from "../fixtures/robbery.clerk.json";
import type { EventGraph, Patch, SceneManifest, Witness } from "./index";

export const storeScene = storeJson as unknown as SceneManifest;
export const robberyGraph = robberyJson as unknown as EventGraph;
export const robberyResolved = robberyResolvedJson;
export const robberyClerkWitness = robberyClerkJson.witness as Witness;
export const robberyClerkSegment = robberyClerkJson.segment;
export const robberyClerkPatches = robberyClerkJson.patches as unknown as Patch[];
