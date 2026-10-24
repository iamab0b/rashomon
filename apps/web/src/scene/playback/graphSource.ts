import { extractSegment, type CallModel, type ExtractContext } from "@rashomon/extractor";
import propsJson from "@rashomon/props";
import type { Event, EventGraph, Patch, PropType, SceneManifest, Segment } from "@rashomon/schema";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import type { GraphSnapshot } from "../store";
import { applyPatches } from "./applyPatches";
import { gatedSnapshot } from "./gatedSnapshot";
import { RECORDED_NOTE, recordedToolCalls } from "./recordedStatements";
import { checkStatement, statementSegmentId } from "./statementId";
import { NO_STATEMENTS, type StatementStatus, type StatementStatuses, type SubmittedStatement } from "./statementStatus";

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
  statementStatuses(): StatementStatuses;
  submitStatement(text: string, witnessName: string): Promise<SubmittedStatement>;
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

function patchableSource(initial: () => FixtureState, manifest: SceneManifest): FixtureGraphSource {
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
        current = gatedState(applyPatches(graph, result.patches, Date.now(), manifest), manifest);
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
      current = gatedState(applyPatches(state().graph, patches, Date.now(), manifest), manifest);
      notify();
    },
  };
}

function fixtureKey(fixture: string, scenario: string | null | undefined): string {
  return scenario === CORRECTED_SCENARIO ? `${fixture}:${CORRECTED_SCENARIO}` : fixture;
}

export function fixtureGraphSource(fixture: string, scenario?: string | null): FixtureGraphSource | null {
  if (scenario && scenario !== CORRECTED_SCENARIO) return null;
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
