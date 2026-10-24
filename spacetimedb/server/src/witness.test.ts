import { beforeEach, describe, expect, test } from "vitest";
import { TestAuth, createModuleTestHarness } from "spacetimedb/server/test-utils";
import type { TestHttpResponder } from "spacetimedb/server/test-utils";
import { robberyGraph } from "@rashomon/schema/fixtures";
import { eventGraphFromRow } from "./convert";
import { runExtraction, type Io } from "./extract/run";
import * as mod from "./index";
import { spacetimedb } from "./tables";

const auth = TestAuth.internal();
const SESSION = "s1";

const h = () => createModuleTestHarness(spacetimedb, mod);
let harness: ReturnType<typeof h>;

const call = (fn: (ctx: never) => unknown) => harness.withReducerTx(auth, fn as never);

const at = (landmark: string) => ({ kind: "at", landmark, second_landmark: null, radius_m: null });

const standAtCooler = {
  actor: "suspect",
  action: "stand",
  from: null,
  to: null,
  at: { kind: "near", landmark: "cooler", second_landmark: null, radius_m: 0.6 },
  facing: null,
  target: null,
  prop: null,
  t_start: 10,
  t_end: 15,
  t_confidence: "stated",
  confidence: "medium",
  sources: [],
};

const respond = (content: unknown[]): TestHttpResponder<never> => () => ({
  code: 200,
  headers: { entries: [] },
  version: { tag: "Http11" },
  body: JSON.stringify({ content, stop_reason: "tool_use" }),
});

const ioFor = (responder: TestHttpResponder<never>): Io => {
  const ctx = harness.procedureContextBuilder(auth).http(responder as never).build();
  return { apiKey: () => "sk-test", http: ctx.http as never, withTx: (body) => ctx.withTx(body as never) as never };
};

const graph = () =>
  eventGraphFromRow(mod.graphForScene(harness.anonymousViewContext(), { sessionId: SESSION }) as never);

const insertSegment = (id: string, witnessId: string) =>
  call((ctx) =>
    mod.insertSegment(ctx, {
      id,
      sessionId: SESSION,
      witnessId,
      speaker: "witness",
      text: "He was back by the drinks cooler. I saw him over there.",
      tStart: 0,
      tEnd: 6,
      source: "live",
      supersedes: undefined,
      utterances: [{ id: `${id}_u1`, text: "He was back by the drinks cooler.", tStart: 0, tEnd: 3 }],
    }),
  );

beforeEach(() => {
  harness = h();
  call((ctx) => mod.createSession(ctx, { id: SESSION, sceneId: robberyGraph.sceneId }));
  call((ctx) =>
    mod.applyPatches(ctx, {
      sessionId: SESSION,
      baseVersion: 0,
      patchesJson: JSON.stringify(robberyGraph.actors.map((actor) => ({ op: "add_actor", actor }))),
    }),
  );
});

describe("witnesses in the module", () => {
  test("a segment from w2 yields events with witnessId w2 through runExtraction", () => {
    insertSegment("seg_w2", "w2");
    const result = runExtraction(ioFor(respond([{ type: "tool_use", id: "tu_1", name: "add_event", input: { ...standAtCooler, sources: [] } }])), SESSION, "seg_w2");
    expect(result.error).toBeUndefined();
    expect(result.patchCount).toBe(1);
    const events = graph().events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ witnessId: "w2", actor: "suspect", sources: ["seg_w2"] });
    expect(harness.db.events.rowKey.find(`${SESSION}/${events[0]!.id}`)?.witnessId).toBe("w2");
  });

  test("graph_for_scene carries witnessId on every event and the witnesses in order of first appearance", () => {
    insertSegment("seg_w1", "w1");
    runExtraction(ioFor(respond([{ type: "tool_use", id: "tu_1", name: "add_event", input: { ...standAtCooler, t_start: 0, t_end: 4, sources: [] } }])), SESSION, "seg_w1");
    insertSegment("seg_w2", "w2");
    runExtraction(ioFor(respond([{ type: "tool_use", id: "tu_2", name: "add_event", input: { ...standAtCooler, sources: [] } }])), SESSION, "seg_w2");
    const g = graph();
    expect(g.events.map((e) => e.witnessId)).toEqual(["w1", "w2"]);
    expect(g.witnesses).toEqual([
      { id: "w1", label: "w1" },
      { id: "w2", label: "w2" },
    ]);
    const row = mod.graphForScene(harness.anonymousViewContext(), { sessionId: SESSION }) as never as { events: { witnessId: string }[] };
    expect(row.events.every((e) => typeof e.witnessId === "string")).toBe(true);
  });

  test("two witnesses placing the suspect apart give soft contradictions addressed to each of them", () => {
    insertSegment("seg_w1", "w1");
    runExtraction(ioFor(respond([{ type: "tool_use", id: "tu_1", name: "add_event", input: { ...standAtCooler, at: at("counter"), t_start: 9, t_end: 12, sources: [] } }])), SESSION, "seg_w1");
    insertSegment("seg_w2", "w2");
    runExtraction(ioFor(respond([{ type: "tool_use", id: "tu_2", name: "add_event", input: { ...standAtCooler, sources: [] } }])), SESSION, "seg_w2");
    const flags = graph().events.flatMap((e) => e.flags).filter((f) => f.check === "contradiction");
    expect(flags).toHaveLength(2);
    expect(flags.every((f) => f.severity === "soft")).toBe(true);
    for (const f of flags) expect(f.suggestedQuestion).toMatch(/^Another witness places the suspect by the .+ around then; you placed the suspect by the .+\. Where was the suspect, as you saw it\?$/);
  });
});
