import type { Event, EventGraph, Patch, SceneManifest } from "@rashomon/schema";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import type { GraphSnapshot } from "../store";
import { applyPatches } from "./applyPatches";
import { gatedSnapshot } from "./gatedSnapshot";

export { gatedSnapshot } from "./gatedSnapshot";

export interface GraphSource {
  readonly kind: "fixture" | "live";
  getSnapshot(): GraphSnapshot;
  subscribe(listener: () => void): () => void;
  eventOf?(id: string): Event | undefined;
}

export interface FixtureGraphSource extends GraphSource {
  readonly kind: "fixture";
  readonly edited: boolean;
  apply(patches: readonly Patch[]): void;
}

type FixtureState = {
  readonly graph: EventGraph;
  readonly snapshot: GraphSnapshot;
};

const CORRECTED_SCENARIO = "corrected";
const CORRECTION_TIME = 0;

export function robberyCorrectionPatches(): readonly Patch[] {
  return (robberyGraph as EventGraph & { correctionPatch: { patches: Patch[] } }).correctionPatch.patches;
}

const memo = new Map<string, FixtureState>();

function memoized(key: string, build: () => FixtureState): () => FixtureState {
  return () => {
    const cached = memo.get(key);
    if (cached) return cached;
    const built = build();
    memo.set(key, built);
    return built;
  };
}

function gatedState(graph: EventGraph, manifest: SceneManifest): FixtureState {
  return { graph, snapshot: gatedSnapshot(graph, manifest) };
}

const FIXTURE_STATES: Readonly<Record<string, () => FixtureState>> = {
  store: memoized("store", () => gatedState(robberyGraph, storeScene)),
  [`store:${CORRECTED_SCENARIO}`]: memoized(`store:${CORRECTED_SCENARIO}`, () =>
    gatedState(applyPatches(robberyGraph, robberyCorrectionPatches(), CORRECTION_TIME, storeScene), storeScene),
  ),
};

function patchableSource(initial: () => FixtureState, manifest: SceneManifest): FixtureGraphSource {
  let current: FixtureState | null = null;
  const listeners = new Set<() => void>();
  const state = () => current ?? initial();
  return {
    kind: "fixture",
    get edited() {
      return current !== null;
    },
    getSnapshot: () => state().snapshot,
    eventOf: (id) => state().graph.events.find((event) => event.id === id),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    apply(patches) {
      current = gatedState(applyPatches(state().graph, patches, Date.now(), manifest), manifest);
      for (const listener of [...listeners]) listener();
    },
  };
}

function fixtureKey(fixture: string, scenario: string | null | undefined): string {
  return scenario === CORRECTED_SCENARIO ? `${fixture}:${CORRECTED_SCENARIO}` : fixture;
}

export function fixtureGraphSource(fixture: string, scenario?: string | null): FixtureGraphSource | null {
  const key = fixtureKey(fixture, scenario);
  const build = Object.hasOwn(FIXTURE_STATES, key) ? FIXTURE_STATES[key] : undefined;
  return build ? patchableSource(build, storeScene) : null;
}

export function scenarioFromSearch(search: string): string | null {
  return new URLSearchParams(search).get("scenario");
}

export function robberyGatedSnapshot(): GraphSnapshot {
  const source = fixtureGraphSource("store");
  if (!source) throw new Error("store fixture graph is not registered");
  return source.getSnapshot();
}
