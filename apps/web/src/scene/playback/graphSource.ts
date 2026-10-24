import type { SceneGeom } from "@rashomon/engine";
import { extractSegment, type CallModel, type ExtractContext } from "@rashomon/extractor";
import propsJson from "@rashomon/props";
import type { Event, EventGraph, Patch, PropType, SceneManifest, Segment } from "@rashomon/schema";
import { robberyClerkPatches, robberyClerkWitness, robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import type { GraphSnapshot } from "../store";
import { applyPatches } from "./applyPatches";
import { gatedSnapshot, NO_GEOM } from "./gatedSnapshot";
import { RECORDED_NOTE, recordedToolCalls } from "./recordedStatements";
import { checkStatement, statementSegmentId } from "./statementId";
import { NO_STATEMENTS, type StatementStatus, type StatementStatuses, type SubmittedStatement } from "./statementStatus";

export { gatedSnapshot, NO_GEOM } from "./gatedSnapshot";

export type GateScene = {
  readonly manifest: SceneManifest;
  readonly geom: SceneGeom;
};

const STORE_GATE: GateScene = { manifest: storeScene, geom: NO_GEOM };

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
  statementStatuses(): StatementStatuses;
  submitStatement(text: string, witnessName: string): Promise<SubmittedStatement>;
}

type FixtureState = {
  readonly graph: EventGraph;
  readonly snapshot: GraphSnapshot;
};

const CORRECTED_SCENARIO = "corrected";
const TWO_WITNESSES_SCENARIO = "two-witnesses";
const SCENARIOS: ReadonlySet<string> = new Set([CORRECTED_SCENARIO, TWO_WITNESSES_SCENARIO]);
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

function gatedState(graph: EventGraph, scene: GateScene): FixtureState {
  return { graph, snapshot: gatedSnapshot(graph, scene.manifest, scene.geom) };
}

function twoWitnessGraph(manifest: SceneManifest): EventGraph {
  const patched = applyPatches(robberyGraph, robberyClerkPatches, CORRECTION_TIME, manifest);
  return { ...patched, witnesses: [...(robberyGraph.witnesses ?? []), { ...robberyClerkWitness }] };
}

function scenarioGraph(scenario: string | null | undefined, manifest: SceneManifest): EventGraph {
  if (scenario === CORRECTED_SCENARIO) return applyPatches(robberyGraph, robberyCorrectionPatches(), CORRECTION_TIME, manifest);
  if (scenario === TWO_WITNESSES_SCENARIO) return twoWitnessGraph(manifest);
  return robberyGraph;
}

const FIXTURE_STATES: Readonly<Record<string, () => FixtureState>> = {
  store: memoized("store", () => gatedState(scenarioGraph(null, storeScene), STORE_GATE)),
  [`store:${CORRECTED_SCENARIO}`]: memoized(`store:${CORRECTED_SCENARIO}`, () =>
    gatedState(scenarioGraph(CORRECTED_SCENARIO, storeScene), STORE_GATE),
  ),
  [`store:${TWO_WITNESSES_SCENARIO}`]: memoized(`store:${TWO_WITNESSES_SCENARIO}`, () =>
    gatedState(scenarioGraph(TWO_WITNESSES_SCENARIO, storeScene), STORE_GATE),
  ),
};

function emptyGraph(sceneId: string): EventGraph {
  return { sceneId, actors: robberyGraph.actors, events: [], props: [], witnesses: robberyGraph.witnesses ?? [], version: 1 };
}

function scanState(scenario: string | null | undefined, scene: GateScene): FixtureState {
  try {
    return gatedState(scenarioGraph(scenario, scene.manifest), scene);
  } catch {
    return gatedState(emptyGraph(scene.manifest.sceneId), scene);
  }
}

function once<T>(build: () => T): () => T {
  let value: { readonly built: T } | null = null;
  return () => {
    value ??= { built: build() };
    return value.built;
  };
}

const FIXTURE_SESSION = "fixture";
const FIXTURE_WITNESS = "w1";
const WORDS_PER_SECOND = 1 / 15;

const recordedModelFor =
  (statement: string): CallModel =>
  async () => ({ content: [...recordedToolCalls(statement)] });

function statementSegment(text: string, witnessName: string): Segment {
  const body = text.trim();
  const name = witnessName.trim();
  const words = body.split(/\s+/).length;
  return {
    id: statementSegmentId(FIXTURE_SESSION, name, body),
    sessionId: FIXTURE_SESSION,
    witnessId: FIXTURE_WITNESS,
    speaker: "witness",
    text: body,
    t: [0, Math.max(1, words * WORDS_PER_SECOND)],
    source: "upload_text",
  };
}

function patchableSource(initial: () => FixtureState, scene: GateScene): FixtureGraphSource {
  const { manifest } = scene;
  let current: FixtureState | null = null;
  let statements: StatementStatuses = NO_STATEMENTS;
  const listeners = new Set<() => void>();
  const state = () => current ?? initial();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  const setStatement = (segmentId: string, status: StatementStatus) => {
    statements = { ...statements, [segmentId]: status };
    notify();
  };
  const run = async (segment: Segment) => {
    const graph = state().graph;
    const context: ExtractContext = {
      landmarks: manifest.landmarks,
      actors: graph.actors,
      propTypes: propsJson as unknown as PropType[],
      events: graph.events,
      props: graph.props,
      recentSegments: [segment],
    };
    try {
      const result = await extractSegment(segment, context, recordedModelFor(segment.text));
      if (result.patches.length > 0) {
        current = gatedState(applyPatches(graph, result.patches, Date.now(), manifest), scene);
      }
      setStatement(segment.id, {
        state: "done",
        patchCount: result.patches.length,
        ...(result.patches.length === 0 ? { note: RECORDED_NOTE } : {}),
      });
    } catch (error) {
      setStatement(segment.id, { state: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  };
  return {
    kind: "fixture",
    get edited() {
      return current !== null;
    },
    getSnapshot: () => state().snapshot,
    statementStatuses: () => statements,
    submitStatement(text, witnessName) {
      const invalid = checkStatement(text, witnessName);
      if (invalid) return Promise.reject(new Error(invalid));
      const segment = statementSegment(text, witnessName);
      const baseVersion = state().graph.version;
      if (!statements[segment.id]) {
        setStatement(segment.id, { state: "extracting" });
        setTimeout(() => void run(segment), 0);
      }
      return Promise.resolve({ segmentId: segment.id, baseVersion });
    },
    eventOf: (id) => state().graph.events.find((event) => event.id === id),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    apply(patches) {
      current = gatedState(applyPatches(state().graph, patches, Date.now(), manifest), scene);
      notify();
    },
  };
}

function fixtureKey(fixture: string, scenario: string | null | undefined): string {
  return scenario ? `${fixture}:${scenario}` : fixture;
}

export function fixtureGraphSource(
  fixture: string,
  scenario?: string | null,
  scan?: GateScene | null,
): FixtureGraphSource | null {
  if (scenario && !SCENARIOS.has(scenario)) return null;
  if (scan) return patchableSource(once(() => scanState(scenario, scan)), scan);
  const key = fixtureKey(fixture, scenario);
  const build = Object.hasOwn(FIXTURE_STATES, key) ? FIXTURE_STATES[key] : undefined;
  return build ? patchableSource(build, STORE_GATE) : null;
}

export function scenarioFromSearch(search: string): string | null {
  return new URLSearchParams(search).get("scenario");
}

export function robberyGatedSnapshot(): GraphSnapshot {
  const source = fixtureGraphSource("store");
  if (!source) throw new Error("store fixture graph is not registered");
  return source.getSnapshot();
}
