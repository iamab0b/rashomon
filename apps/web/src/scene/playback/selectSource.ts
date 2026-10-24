import { liveOptionsFromSearch, type LiveConnector } from "../live/liveConnection";
import { liveGraphSource } from "../live/liveGraphSource";
import { spacetimeConnector } from "../live/spacetimeConnector";
import { fixtureGraphSource, scenarioFromSearch, type GraphSource } from "./graphSource";

export type GraphMode = "fixture" | "live";

const LIVE_MODE = "live";
const DEFAULT_FIXTURE = "store";

export function modeFromSearch(search: string): GraphMode {
  return new URLSearchParams(search).get("mode") === LIVE_MODE ? "live" : "fixture";
}

export function selectSource(
  search: string,
  fixture: string = DEFAULT_FIXTURE,
  connect: LiveConnector = spacetimeConnector,
): GraphSource | null {
  return modeFromSearch(search) === "live"
    ? liveGraphSource(liveOptionsFromSearch(search), connect)
    : fixtureGraphSource(fixture, scenarioFromSearch(search));
}
