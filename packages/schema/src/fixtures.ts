import storeJson from "../fixtures/store.scene.json";
import robberyJson from "../fixtures/robbery.graph.json";
import type { EventGraph, SceneManifest } from "./index";

export const storeScene = storeJson as unknown as SceneManifest;
export const robberyGraph = robberyJson as unknown as EventGraph;
