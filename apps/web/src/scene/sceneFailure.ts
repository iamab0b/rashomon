import { isKnownFixture } from "./loaders/scene";
import { scenarioFromSearch } from "./playback/graphSource";
import { scanFailure } from "./loaders/scanRequest";

export function unknownFixtureMessage(fixture: string): string {
  return `Unknown fixture "${fixture}"`;
}

export function noGraphMessage(fixture: string, scenario: string | null): string {
  return scenario === null
    ? `No graph for fixture "${fixture}"`
    : `No graph for fixture "${fixture}" and scenario "${scenario}"`;
}

export function sceneFailure(fixture: string, search: string, hasGraphSource: boolean): string | null {
  if (!isKnownFixture(fixture)) return unknownFixtureMessage(fixture);
  if (!hasGraphSource) return noGraphMessage(fixture, scenarioFromSearch(search));
  return null;
}

export const SCAN_FIXTURE = "scan";

export function scanSceneFailure(search: string, scanLoaded: boolean, hasGraphSource: boolean): string | null {
  return scanFailure(search) ?? (scanLoaded && !hasGraphSource ? noGraphMessage(SCAN_FIXTURE, scenarioFromSearch(search)) : null);
}

export function shouldSignalReady(state: { hasGraph: boolean; actorsReady: boolean; failure: string | null }): boolean {
  return state.failure === null && (!state.hasGraph || state.actorsReady);
}
