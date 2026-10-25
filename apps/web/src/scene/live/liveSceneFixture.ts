import { ROOM_FIXTURE } from "../loaders/roomFixture";
import type { GraphSource } from "../playback/graphSource";
import type { GraphSnapshot } from "../store";

const LIVE_SCENE_FIXTURES: Readonly<Record<string, string>> = {
  store_v1: "store",
  room_v1: ROOM_FIXTURE,
};

export function meshFixtureFor(fixture: string | undefined, sceneId: string | null): string | undefined {
  return sceneId !== null && Object.hasOwn(LIVE_SCENE_FIXTURES, sceneId) ? LIVE_SCENE_FIXTURES[sceneId] : fixture;
}

export function liveSceneIdOf(state: { graphSource: GraphSource | null; graph: GraphSnapshot["graph"] }): string | null {
  return state.graphSource?.kind === "live" ? (state.graph?.sceneId ?? null) : null;
}
