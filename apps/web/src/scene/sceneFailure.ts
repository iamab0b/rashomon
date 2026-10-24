import { isKnownFixture } from "./loaders/scene";
import { scenarioFromSearch } from "./playback/graphSource";

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

export function shouldSignalReady(state: { hasGraph: boolean; actorsReady: boolean; failure: string | null }): boolean {
  return state.failure === null && (!state.hasGraph || state.actorsReady);
}
