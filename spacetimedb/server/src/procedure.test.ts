import { beforeEach, describe, expect, test, vi } from "vitest";
import { ConnectionId } from "spacetimedb";
import { SenderError } from "spacetimedb/server";
import { Request } from "spacetimedb/server";
import { TestAuth, createModuleTestHarness } from "spacetimedb/server/test-utils";
import type { TestHttpResponder } from "spacetimedb/server/test-utils";
import { robberyGraph } from "@rashomon/schema/fixtures";
import robberyTranscript from "../../../packages/extractor/fixtures/robbery.transcript.json";
import robberyToolUses from "./fixtures/robbery.tool-uses.json";
import { EXTRACTION_MODEL, NO_TOOL_CALL_NUDGE } from "@rashomon/extractor";
import {
  SECRET_HEADER,
  defaultSegmentId,
  handleCartesia,
  handleEndInterview,
  handleSceneContext,
  secretsMatch,
  takeNextQuestion,
} from "./http/cartesia";
import { MAX_BODY_BYTES, MAX_SEGMENT_TEXT_CHARS, MAX_UTTERANCES } from "./limits";
import {
  EXTRACTION_FAILED,
  EXTRACTION_PARTLY_FAILED,
  MAX_RETRIES,
  PROMPT_HASH,
  REQUEST_TIMEOUT_MS,
  runExtraction,
  type Io,
} from "./extract/run";
import { NOT_THE_MODULE, extractAs } from "./procedures/extractSegment";
import * as mod from "./index";
import { eventGraphFromRow } from "./convert";
import { spacetimedb } from "./tables";

const auth = TestAuth.internal();
const SESSION = "s1";
const SECRET = "sk-test-secret-value";
const HOOK = "whsec-test-value";

const h = () => createModuleTestHarness(spacetimedb, mod);
let harness: ReturnType<typeof h>;
let requests: { headers: string; body: string }[];
let logged: string[];

const call = (fn: (ctx: never) => unknown) => harness.withReducerTx(auth, fn as never);

const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({ type: "tool_use", id, name, input });

const at = (landmark: string) => ({ kind: "at", landmark, second_landmark: null, radius_m: null });

const walkInput = {
  actor: "suspect",
  action: "walk",
  from: at("front_door"),
  to: { kind: "near", landmark: "counter", second_landmark: null, radius_m: 0.6 },
  at: null,
  facing: null,
  target: null,
  prop: null,
  t_start: 0,
  t_end: 5,
  t_confidence: "inferred",
  confidence: "high",
  sources: ["utt_2"],
};

const ok = (content: unknown[], extra: Record<string, unknown> = {}): TestHttpResponder<never> => () => ({
  code: 200,
  headers: { entries: [] },
  version: { tag: "Http11" },
  body: JSON.stringify({ content, stop_reason: "tool_use", ...extra }),
});

const status =
  (code: number, body: string): TestHttpResponder<never> =>
  () => ({ code, headers: { entries: [] }, version: { tag: "Http11" }, body });

const ioFor = (responder: TestHttpResponder<never>, apiKey: string = SECRET): Io => {
  const recording: TestHttpResponder<never> = (test, req, body) => {
    requests.push({
      headers: req.headers.entries.map((e) => `${e.name}:${new TextDecoder().decode(e.value as Uint8Array)}`).join("\n"),
      body: new TextDecoder().decode(body),
    });
    return responder(test, req, body);
  };
  const ctx = harness.procedureContextBuilder(auth).http(recording as never).build();
  return { apiKey: () => apiKey, http: ctx.http as never, withTx: (body) => ctx.withTx(body as never) as never };
};

const graph = () =>
  eventGraphFromRow(mod.graphForScene(harness.anonymousViewContext(), { sessionId: SESSION }) as never);

const segmentRow = (id = "utt_2") => harness.db.segments.rowKey.find(`${SESSION}/${id}`)!;

const insertWitnessSegment = (id = "utt_2", speaker = "witness") =>
  call((ctx) =>
    mod.insertSegment(ctx, {
      id,
      sessionId: SESSION,
      witnessId: "w1",
      speaker,
      text: "A guy came in the front door and went straight up to the counter.",
      tStart: 7.8,
      tEnd: 16.7,
      source: "upload_text",
      supersedes: undefined,
      utterances: [{ id: `${id}_a`, text: "A guy came in the front door.", tStart: 7.8, tEnd: 12 }],
    }),
  );

const lastLog = () => logged[logged.length - 1] ?? "";

beforeEach(() => {
  harness = h();
  requests = [];
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
  call((ctx) => mod.createSession(ctx, { id: SESSION, sceneId: robberyGraph.sceneId }));
  call((ctx) =>
    mod.applyPatches(ctx, {
      sessionId: SESSION,
      baseVersion: 0,
      patchesJson: JSON.stringify(robberyGraph.actors.map((actor) => ({ op: "add_actor", actor }))),
    }),
  );
  insertWitnessSegment();
});

describe("extractSegment", () => {
  test("a tool_use response becomes patches, the graph re-gates and provenance is recorded", () => {
    const result = runExtraction(ioFor(ok([toolUse("tu_1", "add_event", walkInput)])), SESSION, "utt_2");
    expect(result.error).toBeUndefined();
    expect(result.patchCount).toBe(1);
    expect(result.statuses).toEqual([{ eventId: "e1", status: "plausible" }]);
    expect(result.hardFlags).toEqual([]);
    const g = graph();
    expect(g.version).toBe(2);
    expect(g.events).toHaveLength(1);
    expect(g.events[0]).toMatchObject({ id: "e1", actor: "suspect", action: "walk", sources: ["utt_2"], confidence: 0.9, status: "plausible" });
    expect(g.events[0]?.flags).toEqual([]);
    const row = segmentRow();
    expect(row.extractModel).toBe(EXTRACTION_MODEL);
    expect(row.extractPromptHash).toBe(PROMPT_HASH);
    expect(row.extractUtteranceIds).toEqual(["utt_2_a"]);
    expect(row.extractedAt).toBeDefined();
    expect(row.extractError).toBeUndefined();
    expect(PROMPT_HASH).toMatch(/^[0-9a-f]{16}$/);
  });

  test("the request goes to the Messages API with the key in a header only", () => {
    const result = runExtraction(ioFor(ok([toolUse("tu_1", "add_event", walkInput)])), SESSION, "utt_2");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers).toContain(`x-api-key:${SECRET}`);
    expect(requests[0]?.body).not.toContain(SECRET);
    const body = JSON.parse(requests[0]!.body) as Record<string, unknown> & { tools: unknown[] };
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.tools.length).toBeGreaterThan(0);
    expect(body.tool_choice).toEqual({ type: "auto" });
    expect(body.max_tokens).toBe(16000);
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body).not.toHaveProperty("thinking");
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(segmentRow(), (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain(SECRET);
  });

  test("the request names the speaking witness, who has no actor link in the module yet", () => {
    runExtraction(ioFor(ok([toolUse("tu_1", "add_event", walkInput)])), SESSION, "utt_2");
    const body = JSON.parse(requests[0]!.body) as { messages: { content: { text: string }[] }[] };
    expect(body.messages[0]?.content[0]?.text).toContain(
      "SPEAKING WITNESS\nThe witness speaking is w1. This witness has no actor yet. If the actor list already has an actor for w1 by name",
    );
  });

  test("a new prop and an event using it apply together and stay resolvable", () => {
    const prop = toolUse("tu_p", "add_prop", { type: "knife_chef", anchor: at("counter"), held_by: "suspect", notes: "maybe eight inches", sources: [] });
    const event = toolUse("tu_e", "add_event", { ...walkInput, action: "pick_up", from: null, to: null, at: at("counter"), prop: "knife_chef" });
    const result = runExtraction(ioFor(ok([prop, event])), SESSION, "utt_2");
    if (result.error !== undefined) throw new Error(result.error);
    expect(graph().props.map((p) => [p.id, p.type])).toEqual([["p_knife_chef", "knife_chef"]]);
    expect(graph().events[0]?.prop).toBe("p_knife_chef");
  });

  test("a 500 writes the error on the segment and changes nothing", () => {
    const before = graph();
    const result = runExtraction(ioFor(status(500, JSON.stringify({ error: { message: "overloaded" } }))), SESSION, "utt_2");
    expect(result).toEqual({ segmentId: "utt_2", patchCount: 0, statuses: [], hardFlags: [], error: EXTRACTION_FAILED });
    expect(segmentRow().extractError).toBe("model_error");
    expect(lastLog()).toBe("extract_segment s1/utt_2 model_error: Anthropic API 500: overloaded");
    expect(segmentRow().extractModel).toBeUndefined();
    expect(graph()).toEqual(before);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  test("a refusal and a response with no tool call are written as errors", () => {
    expect(runExtraction(ioFor(ok([], { stop_reason: "refusal" })), SESSION, "utt_2").error).toBe(EXTRACTION_FAILED);
    expect(segmentRow().extractError).toBe("model_refused");
    expect(lastLog()).toMatch(/model_refused: the model refused/);
    const empty = runExtraction(ioFor(ok([{ type: "text", text: "hello" }])), SESSION, "utt_2");
    expect(empty.error).toBe(EXTRACTION_FAILED);
    expect(segmentRow().extractError).toBe("bad_tool_output");
    expect(lastLog()).toMatch(/bad_tool_output: validation failed: the model returned no tool call/);
    expect(graph().events).toEqual([]);
  });

  test("an invalid tool result is rejected by the validator, retried once, and changes nothing", () => {
    const badInput = { ...walkInput, from: at("moon_base") };
    const result = runExtraction(ioFor(ok([toolUse("tu_1", "add_event", badInput)])), SESSION, "utt_2");
    expect(requests).toHaveLength(2);
    expect(JSON.parse(requests[1]!.body).messages).toHaveLength(3);
    expect(result.patchCount).toBe(0);
    expect(result.error).toBe(EXTRACTION_FAILED);
    expect(segmentRow().extractError).toBe("bad_tool_output");
    expect(lastLog()).toMatch(/bad_tool_output: validation failed: add_event:/);
    expect(graph().events).toEqual([]);
    expect(graph().version).toBe(1);
  });

  test("a reply with no tool call is retried once with the assistant turn unchanged and a nudge, then applied", () => {
    const prose = [
      { type: "thinking", thinking: "", signature: "sig-1" },
      { type: "text", text: "The suspect walked to the counter." },
    ];
    let n = 0;
    const responder: TestHttpResponder<never> = (test, req, body) => {
      n += 1;
      return n === 1 ? ok(prose, { stop_reason: "end_turn" })(test, req, body) : ok([toolUse("tu_1", "add_event", walkInput)])(test, req, body);
    };
    const result = runExtraction(ioFor(responder), SESSION, "utt_2");
    expect(n).toBe(2);
    expect(result.error).toBeUndefined();
    expect(graph().events).toHaveLength(1);
    const [first, second] = requests.map((r) => JSON.parse(r.body) as { messages: unknown[]; tool_choice: unknown; output_config: unknown });
    expect(first!.messages).toHaveLength(1);
    expect(second!.messages).toHaveLength(3);
    expect(second!.messages[0]).toEqual(first!.messages[0]);
    expect(second!.messages[1]).toEqual({ role: "assistant", content: prose });
    expect(second!.messages[2]).toEqual({ role: "user", content: NO_TOOL_CALL_NUDGE });
    expect([first!.tool_choice, second!.tool_choice]).toEqual([{ type: "auto" }, { type: "auto" }]);
    expect([first!.output_config, second!.output_config]).toEqual([{ effort: "low" }, { effort: "low" }]);
  });

  test("a reply cut off by max_tokens before any tool call is stored as truncated and not retried", () => {
    const thinkingOnly = [{ type: "thinking", thinking: "", signature: "sig-1" }];
    const result = runExtraction(ioFor(ok(thinkingOnly, { stop_reason: "max_tokens" })), SESSION, "utt_2");
    expect(requests).toHaveLength(1);
    expect(result.error).toBe(EXTRACTION_FAILED);
    expect(segmentRow().extractError).toBe("truncated");
    expect(lastLog()).toMatch(/truncated: the reply reached max_tokens before it finished/);
    expect(graph().events).toEqual([]);
  });

  test("a truncated reply with a cut-off tool call is stored as truncated, not as bad tool output", () => {
    const cutOff = [toolUse("tu_1", "add_event", { actor: "suspect", action: "walk" })];
    const result = runExtraction(ioFor(ok(cutOff, { stop_reason: "max_tokens" })), SESSION, "utt_2");
    expect(requests).toHaveLength(1);
    expect(result.error).toBe(EXTRACTION_FAILED);
    expect(segmentRow().extractError).toBe("truncated");
    expect(graph().events).toEqual([]);
  });

  test("a retry cut off by max_tokens keeps and applies the calls the first reply got right", () => {
    let n = 0;
    const responder: TestHttpResponder<never> = (test, req, body) => {
      n += 1;
      if (n === 1)
        return ok([toolUse("tu_ok", "add_event", walkInput), toolUse("tu_bad", "add_event", { ...walkInput, from: at("moon_base") })])(test, req, body);
      return ok([toolUse("tu_fix", "add_event", { actor: "suspect" })], { stop_reason: "max_tokens" })(test, req, body);
    };
    const result = runExtraction(ioFor(responder), SESSION, "utt_2");
    expect(n).toBe(2);
    expect(result.patchCount).toBe(1);
    expect(result.error).toBe(EXTRACTION_PARTLY_FAILED);
    expect(graph().events).toHaveLength(1);
    expect(segmentRow().extractError).toBe("truncated");
    expect(segmentRow().extractedAt).toBeDefined();
    expect(segmentRow().extractPatchCount).toBe(1);
    expect(lastLog()).toMatch(/truncated: partly rejected: truncated/);
  });

  test("a retry that fixes the call is applied", () => {
    let n = 0;
    const responder: TestHttpResponder<never> = (test, req, body) => {
      n += 1;
      return ok([toolUse("tu_1", "add_event", n === 1 ? { ...walkInput, from: at("moon_base") } : walkInput)])(test, req, body);
    };
    const result = runExtraction(ioFor(responder), SESSION, "utt_2");
    expect(n).toBe(2);
    expect(result.error).toBeUndefined();
    expect(graph().events).toHaveLength(1);
  });

  test("a call naming an unknown target is rejected before anything is written", () => {
    const dangling = { ...walkInput, actor: "suspect", target: "nobody" };
    const result = runExtraction(ioFor(ok([toolUse("tu_1", "add_event", dangling)])), SESSION, "utt_2");
    expect(result.error).toBe(EXTRACTION_FAILED);
    expect(result.patchCount).toBe(0);
    expect(graph().events).toEqual([]);
    expect(graph().version).toBe(1);
    expect(segmentRow().extractError).toBe("bad_tool_output");
    expect(lastLog()).toMatch(/nobody/);
  });

  test("when the second patch of a validated batch fails to apply, the first is rolled back too", () => {
    call((ctx) =>
      mod.applyPatches(ctx, {
        sessionId: SESSION,
        baseVersion: 1,
        patchesJson: JSON.stringify([
          ...robberyGraph.props.map((prop) => ({ op: "add_prop", prop })),
          ...robberyGraph.events.map((event) => ({ op: "add_event", event })),
        ]),
      }),
    );
    const responder: TestHttpResponder<never> = (test, req, b) => {
      call((ctx) =>
        mod.applyPatches(ctx, {
          sessionId: SESSION,
          baseVersion: 2,
          patchesJson: JSON.stringify([{ op: "retract_event", id: "e7", sources: ["utt_2"] }]),
        }),
      );
      const nulls = { action: null, from: null, to: null, at: null, facing: null, target: null, prop: null, t_end: null };
      return ok([
        toolUse("tu_1", "add_event", { ...walkInput, actor: "clerk", t_start: 15, t_end: 18 }),
        toolUse("tu_2", "update_event", { id: "e7", ...nulls, t_start: 12.5, sources: ["utt_2"] }),
      ])(test, req, b);
    };
    const before = { graph: undefined as ReturnType<typeof graph> | undefined, patches: 0 };
    const seen: TestHttpResponder<never> = (test, req, b) => {
      const out = responder(test, req, b);
      before.graph = graph();
      before.patches = [...harness.db.patches.sessionId.filter(SESSION)].length;
      return out;
    };
    const result = runExtraction(ioFor(seen), SESSION, "utt_2");

    expect(requests).toHaveLength(1);
    expect(result).toEqual({ segmentId: "utt_2", patchCount: 0, statuses: [], hardFlags: [], error: EXTRACTION_FAILED });
    expect(segmentRow().extractError).toBe("apply_failed");
    expect(lastLog()).toMatch(/apply_failed: applying the patches failed: .*e7 was retracted and cannot be updated/);
    const after = graph();
    expect(before.graph?.version).toBe(3);
    expect(after.version).toBe(3);
    expect(after.events.map((e) => [e.id, e.status])).toEqual(before.graph?.events.map((e) => [e.id, e.status]));
    expect(after).toEqual(before.graph);
    expect(after.events.some((e) => e.actor === "clerk" && e.action === "walk")).toBe(false);
    expect([...harness.db.patches.sessionId.filter(SESSION)]).toHaveLength(before.patches);
    expect(segmentRow().extractedAt).toBeUndefined();
  });

  test("a second call for an extracted segment returns the stored result without calling the model", () => {
    const first = runExtraction(ioFor(ok([toolUse("tu_1", "add_event", walkInput)])), SESSION, "utt_2");
    const patchRows = [...harness.db.patches.sessionId.filter(SESSION)].length;
    const extractedAt = segmentRow().extractedAt;
    const again = runExtraction(ioFor(ok([toolUse("tu_9", "add_event", { ...walkInput, actor: "clerk" })])), SESSION, "utt_2");
    expect(requests).toHaveLength(1);
    expect(again).toEqual(first);
    expect(again.patchCount).toBe(1);
    expect(segmentRow().extractPatchCount).toBe(1);
    expect(segmentRow().extractedAt).toEqual(extractedAt);
    expect(graph().version).toBe(2);
    expect(graph().events).toHaveLength(1);
    expect([...harness.db.patches.sessionId.filter(SESSION)]).toHaveLength(patchRows);
  });

  test("a stored partial result is returned as partly failed with its patch count", () => {
    let n = 0;
    const bad = toolUse("tu_2", "add_event", { ...walkInput, from: at("moon_base") });
    const responder: TestHttpResponder<never> = (test, req, b) =>
      (n++ === 0 ? ok([toolUse("tu_1", "add_event", walkInput), bad]) : ok([bad]))(test, req, b);
    const first = runExtraction(ioFor(responder), SESSION, "utt_2");
    expect(first).toMatchObject({ patchCount: 1, error: "extraction partly failed" });
    const calls = requests.length;
    expect(runExtraction(ioFor(responder), SESSION, "utt_2")).toEqual(first);
    expect(requests).toHaveLength(calls);
  });

  test("a failed extraction is not stored as done, so the next call tries again", () => {
    runExtraction(ioFor(status(500, "{}")), SESSION, "utt_2");
    expect(segmentRow().extractedAt).toBeUndefined();
    const retry = runExtraction(ioFor(ok([toolUse("tu_1", "add_event", walkInput)])), SESSION, "utt_2");
    expect(requests).toHaveLength(2);
    expect(retry).toMatchObject({ patchCount: 1, error: undefined });
    expect(segmentRow().extractError).toBeUndefined();
  });

  test("when two calls overlap, only the first to finish applies its patches", () => {
    let nested: ReturnType<typeof runExtraction> | undefined;
    const outer: TestHttpResponder<never> = (test, req, b) => {
      if (!nested) nested = runExtraction(ioFor(ok([toolUse("tu_n", "add_event", walkInput)])), SESSION, "utt_2");
      return ok([toolUse("tu_o", "add_event", { ...walkInput, actor: "clerk", t_start: 15, t_end: 18 })])(test, req, b);
    };
    const result = runExtraction(ioFor(outer), SESSION, "utt_2");
    expect(nested).toMatchObject({ patchCount: 1, error: undefined });
    expect(result).toEqual(nested);
    expect(graph().version).toBe(2);
    expect(graph().events.map((e) => e.actor)).toEqual(["suspect"]);
  });

  test("no key, an unknown segment and a non-witness segment never reach the model", () => {
    expect(runExtraction(ioFor(ok([]), ""), SESSION, "utt_2").error).toBe(EXTRACTION_FAILED);
    expect(segmentRow().extractError).toBe("no_api_key");
    expect(lastLog()).toMatch(/no_api_key: ANTHROPIC_API_KEY is not set/);
    expect(runExtraction(ioFor(ok([])), SESSION, "nope").error).toBe("unknown segment");
    expect(runExtraction(ioFor(ok([])), "nope", "utt_2").error).toBe("unknown session");
    insertWitnessSegment("q1", "interviewer");
    expect(runExtraction(ioFor(ok([])), SESSION, "q1")).toMatchObject({ patchCount: 0, error: undefined });
    expect(requests).toHaveLength(0);
  });

  test("the key is declared as a required module env string and never stored", () => {
    const dump = JSON.stringify(
      [...harness.db.segments.iter(), ...harness.db.sessions.iter(), ...harness.db.patches.iter()],
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
    );
    expect(dump).not.toContain("sk-");
  });
});

describe("a relocation the model reply leaves incomplete", () => {
  const CORRECTION = "Oh. No, you're right, I'd stepped out. I came to the front by the window to see what was going on. I saw him from there.";
  const none = { action: null, from: null, to: null, at: null, facing: null, target: null, prop: null, t_start: null, t_end: null };
  const moveE5 = toolUse("tu_e5", "update_event", { ...none, id: "e5", at: at("window_front"), sources: [] });

  const seedAndCorrect = () => {
    call((ctx) =>
      mod.applyPatches(ctx, {
        sessionId: SESSION,
        baseVersion: 1,
        patchesJson: JSON.stringify([
          ...robberyGraph.props.map((prop) => ({ op: "add_prop", prop })),
          ...robberyGraph.events.map(({ status: _s, flags: _f, ...event }) => ({ op: "add_event", event })),
        ]),
      }),
    );
    call((ctx) =>
      mod.insertSegment(ctx, {
        id: "utt_12",
        sessionId: SESSION,
        witnessId: "w1",
        speaker: "witness",
        text: CORRECTION,
        tStart: 81,
        tEnd: 87,
        source: "live",
        supersedes: undefined,
        utterances: [{ id: "utt_12_a", text: CORRECTION, tStart: 81, tEnd: 87 }],
      }),
    );
  };

  test("a reply that only moves e5 still gets the walk and the shortened e3, and e3 and e5 carry no contradiction", () => {
    seedAndCorrect();
    const result = runExtraction(ioFor(ok([moveE5])), SESSION, "utt_12");
    expect(result.error).toBeUndefined();
    expect(result.patchCount).toBe(4);
    const g = graph();
    const byId = (id: string) => g.events.find((e) => e.id === id)!;
    expect(byId("e5").at).toEqual({ kind: "at", landmark: "window_front" });
    expect(byId("e3").t).toEqual([0, 6]);
    expect(byId("e9").at).toEqual({ kind: "at", landmark: "window_front" });
    expect(byId("e11")).toMatchObject({ actor: "witness", action: "walk", from: { kind: "at", landmark: "aisle_chips" }, to: { kind: "at", landmark: "window_front" }, t: [6, 10] });
    for (const id of ["e3", "e5", "e9", "e11"]) {
      expect(byId(id).flags, id).toEqual([]);
      expect(byId(id).status, id).toBe("plausible");
    }
    expect(segmentRow("utt_12").extractError).toBeUndefined();
  });
});

describe("the Cartesia webhook", () => {
  const webhookIo = (responder: TestHttpResponder<never>, secret: string | undefined = HOOK) => ({
    ...ioFor(responder),
    webhookSecret: () => secret,
  });
  const SEG = defaultSegmentId(SESSION, "w1", [{ text: "A guy came in the front door.", tStart: 7.8, tEnd: 12 }], 1);
  const body = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      sessionId: SESSION,
      witness: "w1",
      utterances: [{ text: "A guy came in the front door.", tStart: 7.8, tEnd: 12 }],
      ...over,
    });
  const post = (text: string, secret: string | null = HOOK) =>
    new Request("http://localhost/webhook/cartesia", {
      method: "POST",
      body: text,
      headers: secret === null ? {} : { [SECRET_HEADER]: secret },
    });
  const exported = mod.cartesiaWebhook as unknown as (ctx: never, req: Request) => { status: number };

  test("a missing or wrong secret is a 401, never reaches the model and stores nothing", () => {
    const io = webhookIo(ok([toolUse("tu_1", "add_event", walkInput)]));
    expect(handleCartesia(io, post(body(), null)).status).toBe(401);
    expect(handleCartesia(io, post(body(), "")).status).toBe(401);
    expect(handleCartesia(io, post(body(), "whsec-test-valuf")).status).toBe(401);
    expect(handleCartesia(io, post(body(), `${HOOK}x`)).status).toBe(401);
    expect(handleCartesia(io, post(body(), HOOK.toUpperCase())).body).toEqual({ error: "unauthorized" });
    expect(requests).toHaveLength(0);
    expect([...harness.db.segments.sessionId.filter(SESSION)]).toHaveLength(1);
  });

  test("an unset secret on the module rejects every request, even one with an empty header", () => {
    expect(handleCartesia(webhookIo(ok([]), ""), post(body(), "")).status).toBe(401);
    expect(handleCartesia(webhookIo(ok([]), undefined), post(body(), "")).status).toBe(401);
    const throwing = { ...webhookIo(ok([])), webhookSecret: () => { throw new Error("env_get"); } };
    expect(handleCartesia(throwing, post(body(), HOOK)).status).toBe(401);
    expect(requests).toHaveLength(0);
  });

  test("secretsMatch compares whole strings", () => {
    expect(secretsMatch(HOOK, HOOK)).toBe(true);
    expect(secretsMatch("", "")).toBe(true);
    expect(secretsMatch(HOOK, `${HOOK}\0`)).toBe(false);
    expect(secretsMatch("abc", "abd")).toBe(false);
    expect(secretsMatch("abc", "ab")).toBe(false);
  });

  test("a bad body with the right secret is a 400 and nothing is stored", () => {
    const io = webhookIo(ok([]));
    expect(handleCartesia(io, post("not json")).status).toBe(400);
    expect(handleCartesia(io, post("[]")).status).toBe(400);
    expect(handleCartesia(io, post(body({ sessionId: undefined }))).status).toBe(400);
    expect(handleCartesia(io, post(body({ utterances: [] }))).status).toBe(400);
    expect(handleCartesia(io, post(body({ utterances: undefined }))).status).toBe(400);
    expect(handleCartesia(io, post(body({ utterances: [{ text: "", tStart: 0, tEnd: 1 }] }))).status).toBe(400);
    expect(handleCartesia(io, post(body({ utterances: [{ text: "x", tStart: 5, tEnd: 1 }] }))).status).toBe(400);
    expect(handleCartesia(io, post(body({ sessionId: "nope" }))).status).toBe(400);
    expect([...harness.db.segments.sessionId.filter(SESSION)]).toHaveLength(1);
    expect(requests).toHaveLength(0);
  });

  test("a body over 64 KB is a 413 and more than 50 utterances is a 400, before anything is stored", () => {
    const io = webhookIo(ok([toolUse("tu_1", "add_event", walkInput)]));
    const big = post(body({ pad: "x".repeat(MAX_BODY_BYTES) }));
    expect(handleCartesia(io, big)).toEqual({ status: 413, body: { error: "the body must be at most 65536 bytes" } });
    const utterance = (i: number) => ({ text: `line ${i}`, tStart: i, tEnd: i + 0.5 });
    const many = Array.from({ length: MAX_UTTERANCES + 1 }, (_, i) => utterance(i));
    expect(handleCartesia(io, post(body({ utterances: many })))).toEqual({
      status: 400,
      body: { error: "at most 50 utterances per request" },
    });
    expect(requests).toHaveLength(0);
    expect([...harness.db.segments.sessionId.filter(SESSION)]).toHaveLength(1);
  });

  test("200,000 valid utterances are refused by the caps instead of overflowing Math.min", () => {
    const io = webhookIo(ok([]));
    const utterances = `${'{"text":"x","tStart":0,"tEnd":1},'.repeat(199_999)}{"text":"x","tStart":0,"tEnd":1}`;
    const out = handleCartesia(io, post(`{"sessionId":"${SESSION}","utterances":[${utterances}]}`));
    expect(out.status).toBe(413);
    expect(JSON.stringify(out.body)).not.toMatch(/call stack|RangeError/);
    expect([...harness.db.segments.sessionId.filter(SESSION)]).toHaveLength(1);
  });

  test("exactly 50 utterances are accepted", () => {
    const io = webhookIo(ok([toolUse("tu_1", "add_event", { ...walkInput, sources: [SEG] })]));
    const fifty = Array.from({ length: MAX_UTTERANCES }, (_, i) => ({ text: `line ${i}`, tStart: i, tEnd: i + 0.5 }));
    const out = handleCartesia(io, post(body({ utterances: fifty })));
    expect(out.status).toBe(200);
    const id = (out.body as { segmentId: string }).segmentId;
    expect(id).toBe(defaultSegmentId(SESSION, "w1", fifty, 1));
    expect(harness.db.segments.rowKey.find(`${SESSION}/${id}`)).toMatchObject({ tStart: 0, tEnd: 49.5 });
  });

  test("the exported handler reads the secret from the module env and checks it first", () => {
    const ctx = { env: { CARTESIA_WEBHOOK_SECRET: HOOK } } as never;
    expect(exported(ctx, post("{}", null)).status).toBe(401);
    expect(exported(ctx, post("{}", "nope")).status).toBe(401);
    expect(exported(ctx, post("{}")).status).toBe(400);
    expect(exported({} as never, post("{}")).status).toBe(401);
  });

  test("a good body inserts the segment, runs the extraction and returns its result", () => {
    const io = webhookIo(ok([toolUse("tu_1", "add_event", { ...walkInput, sources: [SEG] })]));
    const out = handleCartesia(io, post(body()));
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ segmentId: SEG, patchCount: 1, statuses: [{ eventId: "e1", status: "plausible" }] });
    const row = harness.db.segments.rowKey.find(`${SESSION}/${SEG}`)!;
    expect(row).toMatchObject({ speaker: "witness", witnessId: "w1", source: "live", tStart: 7.8, tEnd: 12 });
    expect(row.extractUtteranceIds).toEqual([`${SEG}_u1`]);
    expect(graph().events).toHaveLength(1);
  });

  test("a resend of the same segment returns the stored result; a different text under its id is a 400", () => {
    const io = webhookIo(ok([toolUse("tu_1", "add_event", { ...walkInput, sources: ["seg_1"] })]));
    const first = handleCartesia(io, post(body({ segmentId: "seg_1" })));
    expect(first.status).toBe(200);
    const again = handleCartesia(io, post(body({ segmentId: "seg_1" })));
    expect(again).toEqual(first);
    expect(requests).toHaveLength(1);
    expect(graph().events).toHaveLength(1);
    const changed = handleCartesia(io, post(body({ segmentId: "seg_1", utterances: [{ text: "Something else.", tStart: 1, tEnd: 2 }] })));
    expect(changed).toEqual({ status: 400, body: { error: "the segment could not be stored" } });
    expect(requests).toHaveLength(1);
  });

  test("a resend without a segmentId gets the same id and the stored result, not a second call", () => {
    const io = webhookIo(ok([toolUse("tu_1", "add_event", walkInput)]));
    const first = handleCartesia(io, post(body()));
    expect(first.status).toBe(200);
    expect(SEG).toMatch(/^seg_[0-9a-f]{16}$/);
    expect(first.body).toMatchObject({ segmentId: SEG, patchCount: 1 });
    const again = handleCartesia(io, post(body()));
    expect(again).toEqual(first);
    expect(requests).toHaveLength(1);
    expect(graph().events).toHaveLength(1);
    expect([...harness.db.segments.sessionId.filter(SESSION)]).toHaveLength(2);
  });

  test("the default segment id changes with the session, the text, the times or the session's segment count", () => {
    const u = { text: "A guy came in the front door.", tStart: 7.8, tEnd: 12 };
    expect(defaultSegmentId(SESSION, "w1", [u], 1)).toBe(SEG);
    expect(defaultSegmentId("s2", "w1", [u], 1)).not.toBe(SEG);
    expect(defaultSegmentId(SESSION, "w1", [{ ...u, text: "A guy came in the back door." }], 1)).not.toBe(SEG);
    expect(defaultSegmentId(SESSION, "w1", [{ ...u, tEnd: 12.5 }], 1)).not.toBe(SEG);
    expect(defaultSegmentId(SESSION, "w1", [u], 2)).not.toBe(SEG);
    expect(defaultSegmentId(SESSION, "w2", [u], 1)).not.toBe(SEG);
  });

  test("two witnesses sending the same words and times without a segmentId get two segments", () => {
    const second = defaultSegmentId(SESSION, "w2", [{ text: "A guy came in the front door.", tStart: 7.8, tEnd: 12 }], 2);
    let n = 0;
    const sources = [SEG, second];
    const responder: TestHttpResponder<never> = (test, req, b) =>
      ok([toolUse(`tu_${n}`, "add_event", { ...walkInput, sources: [sources[n++]] })])(test, req, b);
    const io = webhookIo(responder);
    expect(handleCartesia(io, post(body())).body).toMatchObject({ segmentId: SEG });
    const out = handleCartesia(io, post(body({ witness: "w2" })));
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ segmentId: second, patchCount: 1 });
    expect(requests).toHaveLength(2);
    expect(harness.db.segments.rowKey.find(`${SESSION}/${SEG}`)).toMatchObject({ witnessId: "w1" });
    expect(harness.db.segments.rowKey.find(`${SESSION}/${second}`)).toMatchObject({ witnessId: "w2" });
  });

  test("a key read that throws is a generic 502 and never reaches the model", () => {
    const hostError = "Unsupported SpacetimeDB host syscall: env_get";
    const io = { ...webhookIo(ok([toolUse("tu_1", "add_event", walkInput)])), apiKey: () => { throw new Error(hostError); } };
    const out = handleCartesia(io, post(body()));
    expect(out).toEqual({ status: 502, body: { error: EXTRACTION_FAILED } });
    expect(requests).toHaveLength(0);
    expect(harness.db.segments.rowKey.find(`${SESSION}/${SEG}`)?.extractError).toBe("no_api_key");
    expect(lastLog()).toBe(`extract_segment s1/${SEG} no_api_key: reading ANTHROPIC_API_KEY failed: ${hostError}`);
  });

  test("an extraction error is a 502 with a generic message, and the detail stays on the segment", () => {
    const out = handleCartesia(webhookIo(status(500, JSON.stringify({ error: { message: "overloaded" } }))), post(body()));
    expect(out).toEqual({ status: 502, body: { error: EXTRACTION_FAILED } });
    expect(harness.db.segments.rowKey.find(`${SESSION}/${SEG}`)?.extractError).toBe("model_error");
    expect(lastLog()).toBe(`extract_segment s1/${SEG} model_error: Anthropic API 500: overloaded`);
  });

  test("an upstream message echoing a variant of the key never reaches the caller", () => {
    const leak = `invalid x-api-key: ${SECRET.toUpperCase()} (${SECRET.slice(0, 12)}...)`;
    const io = webhookIo(status(401, JSON.stringify({ error: { message: leak } })));
    const out = handleCartesia(io, post(body()));
    expect(out).toEqual({ status: 502, body: { error: EXTRACTION_FAILED } });
    const procedure = runExtraction(ioFor(status(401, JSON.stringify({ error: { message: leak } }))), SESSION, "utt_2");
    expect(procedure.error).toBe(EXTRACTION_FAILED);
    for (const text of [JSON.stringify(out), JSON.stringify(procedure)]) {
      expect(text.toLowerCase()).not.toContain(SECRET.slice(0, 12).toLowerCase());
      expect(text).not.toMatch(/x-api-key|Anthropic/);
    }
  });

  test("a segment the reducer refuses is a 400 with a fixed message, not the reducer's", () => {
    const out = handleCartesia(webhookIo(ok([])), post(body({ sessionId: "s_secret_name" })));
    expect(out).toEqual({ status: 400, body: { error: "the segment could not be stored" } });
    expect(requests).toHaveLength(0);
  });

  test("a partly rejected batch is a 200 whose error is generic", () => {
    const good = toolUse("tu_1", "add_event", { ...walkInput, sources: [SEG] });
    const badCall = toolUse("tu_2", "add_event", { ...walkInput, from: at("moon_base") });
    let n = 0;
    const responder: TestHttpResponder<never> = (test, req, b) => (n++ === 0 ? ok([good, badCall]) : ok([badCall]))(test, req, b);
    const out = handleCartesia(webhookIo(responder), post(body()));
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ patchCount: 1, error: "extraction partly failed" });
    expect(JSON.stringify(out.body)).not.toContain("moon_base");
    expect(harness.db.segments.rowKey.find(`${SESSION}/${SEG}`)?.extractError).toBe("partly_rejected");
    expect(lastLog()).toMatch(/partly_rejected: partly rejected: add_event: .*moon_base/);
  });
  const STATEMENT = "A guy came in the front door.";
  const plainId = defaultSegmentId(SESSION, "witness", [{ text: STATEMENT }], 1);
  const plain = (over: Record<string, unknown> = {}) => JSON.stringify({ sessionId: SESSION, text: STATEMENT, ...over });

  test("a plain text body is stored as one utterance after the session's last segment and extracted", () => {
    const io = webhookIo(ok([toolUse("tu_1", "add_event", { ...walkInput, sources: [plainId] })]));
    const out = handleCartesia(io, post(plain()));
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ segmentId: plainId, patchCount: 1 });
    const row = harness.db.segments.rowKey.find(`${SESSION}/${plainId}`)!;
    expect(row).toMatchObject({ text: STATEMENT, speaker: "witness", witnessId: "witness", source: "live", tStart: 16.7, tEnd: 19.5 });
    expect(row.extractUtteranceIds).toEqual([`${plainId}_u1`]);
    expect(graph().events).toHaveLength(1);
  });

  test("a resent plain text body without a segmentId does not extract twice", () => {
    const io = webhookIo(ok([toolUse("tu_1", "add_event", { ...walkInput, sources: [plainId] })]));
    const first = handleCartesia(io, post(plain()));
    const again = handleCartesia(io, post(plain({ text: `  ${STATEMENT} ` })));
    expect(first.status).toBe(200);
    expect(again).toEqual(first);
    expect(requests).toHaveLength(1);
    expect([...harness.db.segments.sessionId.filter(SESSION)]).toHaveLength(2);
    expect(graph().events).toHaveLength(1);
  });

  test("a second identical answer after another statement is a new segment, while a retry is deduplicated", () => {
    const no = defaultSegmentId(SESSION, "witness", [{ text: "No." }], 1);
    const other = defaultSegmentId(SESSION, "witness", [{ text: "He had a knife." }], 2);
    const noAgain = defaultSegmentId(SESSION, "witness", [{ text: "No." }], 3);
    let n = 0;
    const sources = [no, other, noAgain];
    const responder: TestHttpResponder<never> = (test, req, b) =>
      ok([toolUse(`tu_${n}`, "add_event", { ...walkInput, sources: [sources[n++]] })])(test, req, b);
    const io = webhookIo(responder);
    const first = handleCartesia(io, post(plain({ text: "No." })));
    expect(first.body).toMatchObject({ segmentId: no });
    expect(handleCartesia(io, post(plain({ text: "No." })))).toEqual(first);
    expect(handleCartesia(io, post(plain({ text: "He had a knife." }))).body).toMatchObject({ segmentId: other });
    const second = handleCartesia(io, post(plain({ text: "No." })));
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ segmentId: noAgain });
    expect(noAgain).not.toBe(no);
    expect(handleCartesia(io, post(plain({ text: "No." }))).body).toMatchObject({ segmentId: noAgain, patchCount: 1 });
    expect(requests).toHaveLength(3);
    expect([...harness.db.segments.sessionId.filter(SESSION)].map((r) => r.id)).toEqual(["utt_2", no, other, noAgain]);
  });

  test("a resent utterance body is deduplicated and the same words with new times later are a new segment", () => {
    const io = webhookIo(ok([toolUse("tu_1", "add_event", { ...walkInput, sources: [SEG] })]));
    const first = handleCartesia(io, post(body()));
    expect(handleCartesia(io, post(body()))).toEqual(first);
    const later = { utterances: [{ text: "A guy came in the front door.", tStart: 40, tEnd: 44 }] };
    const laterId = defaultSegmentId(SESSION, "w1", later.utterances, 2);
    const out = handleCartesia(webhookIo(ok([toolUse("tu_2", "add_event", { ...walkInput, sources: [laterId] })])), post(body(later)));
    expect(out.body).toMatchObject({ segmentId: laterId });
    expect([...harness.db.segments.sessionId.filter(SESSION)]).toHaveLength(3);
  });

  test("a plain text body without text is a 400, and a wrong secret is a 401, before anything is stored", () => {
    const io = webhookIo(ok([]));
    expect(handleCartesia(io, post(plain({ text: "   " })))).toEqual({ status: 400, body: { error: "text or utterances is required" } });
    expect(handleCartesia(io, post(JSON.stringify({ sessionId: SESSION })))).toEqual({
      status: 400,
      body: { error: "text or utterances is required" },
    });
    expect(handleCartesia(io, post(plain(), "nope")).status).toBe(401);
    expect(requests).toHaveLength(0);
    expect([...harness.db.segments.sessionId.filter(SESSION)]).toHaveLength(1);
  });

  const applyRobberyEvents = () =>
    call((ctx) =>
      mod.applyPatches(ctx, {
        sessionId: SESSION,
        baseVersion: 1,
        patchesJson: JSON.stringify([
          ...robberyGraph.props.map((prop) => ({ op: "add_prop", prop })),
          ...robberyGraph.events.map(({ status: _s, flags: _f, ...event }) => ({ op: "add_event", event })),
        ]),
      }),
    );
  const ask = (text: string, secret: string | null = HOOK) =>
    new Request("http://localhost/webhook/cartesia/scene_context", {
      method: "POST",
      body: text,
      headers: secret === null ? {} : { [SECRET_HEADER]: secret },
    });

  test("scene context lists the landmarks and has no question before anything is flagged", () => {
    const out = handleSceneContext(webhookIo(ok([])), ask(JSON.stringify({ sessionId: SESSION })));
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ recentEvents: [], openQuestions: [], nextQuestion: null });
    const landmarks = (out.body as { landmarks: { id: string; label: string }[] }).landmarks;
    expect(landmarks).toHaveLength(11);
    expect(landmarks[0]).toEqual({ id: "front_door", label: "front door" });
  });

  test("scene context returns the last five events and the hard flag's question as the next question", () => {
    applyRobberyEvents();
    const flag = [...harness.db.flags.sessionId.filter(SESSION)].find((f) => f.severity === "hard")!;
    expect(flag.eventId).toBe("e5");
    const out = handleSceneContext(webhookIo(ok([])), ask(JSON.stringify({ session_id: SESSION })));
    expect(out.status).toBe(200);
    const body = out.body as { recentEvents: { id: string; actor: string; where: string | null }[]; nextQuestion: string };
    expect(body.recentEvents.map((e) => e.id)).toEqual(robberyGraph.events.slice(-5).map((e) => e.id));
    const labels = new Map(robberyGraph.actors.map((a) => [a.id, a.label]));
    expect(body.recentEvents.map((e) => e.actor)).toEqual(robberyGraph.events.slice(-5).map((e) => labels.get(e.actor)));
    expect(body.nextQuestion).toBe(flag.suggestedQuestion);
    expect(out.body).toMatchObject({ openQuestions: [{ eventId: "e5", question: flag.suggestedQuestion }] });
    expect(requests).toHaveLength(0);
  });

  test("scene context and end interview refuse a wrong secret and an unknown session", () => {
    const io = webhookIo(ok([]));
    for (const handle of [handleSceneContext, handleEndInterview]) {
      expect(handle(io, ask(JSON.stringify({ sessionId: SESSION }), null)).status).toBe(401);
      expect(handle(io, ask(JSON.stringify({ sessionId: SESSION }), "nope")).body).toEqual({ error: "unauthorized" });
      expect(handle(io, ask(JSON.stringify({ sessionId: "nope" })))).toEqual({ status: 400, body: { error: "unknown session" } });
      expect(handle(io, ask("{}")).status).toBe(400);
    }
    expect(requests).toHaveLength(0);
  });

  test("end interview returns the session's counts and changes nothing", () => {
    applyRobberyEvents();
    const out = handleEndInterview(webhookIo(ok([])), ask(JSON.stringify({ sessionId: SESSION })));
    expect(out).toEqual({ status: 200, body: { ended: true, statements: 1, events: robberyGraph.events.length, openQuestions: 1 } });
    expect([...harness.db.segments.sessionId.filter(SESSION)]).toHaveLength(1);
  });

  test("two witnesses saying the same words in a row get two segments", () => {
    const first = defaultSegmentId(SESSION, "w1", [{ text: STATEMENT }], 1);
    const second = defaultSegmentId(SESSION, "w2", [{ text: STATEMENT }], 2);
    expect(defaultSegmentId(SESSION, "w2", [{ text: STATEMENT }], 1)).not.toBe(first);
    let n = 0;
    const sources = [first, second];
    const responder: TestHttpResponder<never> = (test, req, b) =>
      ok([toolUse(`tu_${n}`, "add_event", { ...walkInput, sources: [sources[n++]] })])(test, req, b);
    const io = webhookIo(responder);
    expect(handleCartesia(io, post(plain({ witness_id: "w1" }))).body).toMatchObject({ segmentId: first });
    expect(handleCartesia(io, post(plain({ witness_id: "w2" }))).body).toMatchObject({ segmentId: second });
    expect(requests).toHaveLength(2);
    expect(harness.db.segments.rowKey.find(`${SESSION}/${second}`)).toMatchObject({ witnessId: "w2", text: STATEMENT });
  });

  test("an overridden event's hard flag is not sent back as an open question anywhere", () => {
    applyRobberyEvents();
    call((ctx) => mod.override(ctx, { sessionId: SESSION, eventId: "e5", reason: "investigator checked the angle", by: "u1" }));
    expect([...harness.db.flags.sessionId.filter(SESSION)].some((f) => f.eventId === "e5" && f.severity === "hard")).toBe(true);
    const context = handleSceneContext(webhookIo(ok([])), ask(JSON.stringify({ sessionId: SESSION })));
    expect(context.body).toMatchObject({ openQuestions: [], nextQuestion: null });
    const ended = handleEndInterview(webhookIo(ok([])), ask(JSON.stringify({ sessionId: SESSION })));
    expect(ended.body).toMatchObject({ openQuestions: 0 });
    const out = handleCartesia(webhookIo(ok([toolUse("tu_1", "add_event", { ...walkInput, sources: [plainId] })])), post(plain()));
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ hardFlags: [], askNext: null });
  });

  test("both extraction attempts finish inside Cartesia's 120 second tool limit", () => {
    expect((MAX_RETRIES + 1) * REQUEST_TIMEOUT_MS).toBeLessThan(120_000);
  });

  test("the exported scene context and end interview handlers check the module secret first", () => {
    const ctx = { env: { CARTESIA_WEBHOOK_SECRET: HOOK } } as never;
    for (const handler of [mod.sceneContextWebhook, mod.endInterviewWebhook]) {
      const exportedHandler = handler as unknown as (ctx: never, req: Request) => { status: number };
      expect(exportedHandler(ctx, ask("{}", null)).status).toBe(401);
      expect(exportedHandler(ctx, ask("{}", "nope")).status).toBe(401);
      expect(exportedHandler(ctx, ask("{}")).status).toBe(400);
      expect(exportedHandler({} as never, ask("{}")).status).toBe(401);
    }
  });
});

describe("the robbery demo path", () => {
  const witness = robberyTranscript.filter((u) => u.witnessId === "w1" && u.speaker === "witness");
  const utterances = witness.map((u) => ({ id: u.id, text: u.text, tStart: u.t[0]!, tEnd: u.t[1]! }));

  test("the fixture covers the first witness's whole statement", () => {
    expect(utterances.map((u) => u.id)).toEqual(Array.from({ length: 11 }, (_, i) => `utt_${i + 1}`));
    expect(robberyToolUses.content).toHaveLength(robberyGraph.props.length + robberyGraph.events.length);
  });

  test("the first witness's statement through runExtraction flags e5 as a sightline the shelf blocks", () => {
    call((ctx) =>
      mod.insertSegment(ctx, {
        id: robberyToolUses.segmentId,
        sessionId: SESSION,
        witnessId: "w1",
        speaker: "witness",
        text: utterances.map((u) => u.text).join(" "),
        tStart: utterances[0]!.tStart,
        tEnd: utterances[utterances.length - 1]!.tEnd,
        source: "upload_text",
        supersedes: undefined,
        utterances,
      }),
    );
    const result = runExtraction(ioFor(ok(robberyToolUses.content)), SESSION, robberyToolUses.segmentId);
    expect(result.error).toBeUndefined();
    expect(result.patchCount).toBe(12);
    expect(result.statuses).toContainEqual({ eventId: "e5", status: "implausible" });
    const g = graph();
    expect(g.events.map((e) => [e.id, e.actor, e.action])).toEqual(robberyGraph.events.map((e) => [e.id, e.actor, e.action]));
    const e5 = g.events.find((e) => e.id === "e5")!;
    expect(e5.status).toBe("implausible");
    const flag = e5.flags.find((f) => f.id === "sightline:e5");
    expect(flag).toMatchObject({ check: "sightline", severity: "hard" });
    expect(flag?.suggestedQuestion).toMatch(/Where exactly were you standing/);
    expect(g.events.filter((e) => e.status === "implausible").map((e) => e.id)).toEqual(["e5"]);
  });

  test("the result carries the session's hard flags after the gate, five fields each", () => {
    call((ctx) =>
      mod.insertSegment(ctx, {
        id: robberyToolUses.segmentId,
        sessionId: SESSION,
        witnessId: "w1",
        speaker: "witness",
        text: utterances.map((u) => u.text).join(" "),
        tStart: utterances[0]!.tStart,
        tEnd: utterances[utterances.length - 1]!.tEnd,
        source: "upload_text",
        supersedes: undefined,
        utterances,
      }),
    );
    const result = runExtraction(ioFor(ok(robberyToolUses.content)), SESSION, robberyToolUses.segmentId);
    const stored = [...harness.db.flags.sessionId.filter(SESSION)].filter((f) => f.severity === "hard");
    expect(stored.length).toBeGreaterThan(0);
    expect(result.hardFlags.map((f) => f.id)).toEqual(stored.sort((a, b) => a.seq - b.seq).map((f) => f.id));
    const e5 = result.hardFlags.find((f) => f.id === "sightline:e5")!;
    expect(Object.keys(e5).sort()).toEqual(["check", "detail", "eventId", "id", "suggestedQuestion"]);
    expect(e5).toMatchObject({ eventId: "e5", check: "sightline" });
    expect(e5.detail).toMatch(/cannot see suspect/);
    expect(e5.suggestedQuestion).toMatch(/Where exactly were you standing/);
    expect([...harness.db.flags.sessionId.filter(SESSION)].some((f) => f.severity !== "hard" && result.hardFlags.some((h) => h.id === f.id))).toBe(false);
  });

  test("the same statement through the Cartesia webhook comes back with e5 implausible and its question", () => {
    const req = new Request("http://localhost/webhook/cartesia", {
      method: "POST",
      headers: { [SECRET_HEADER]: HOOK },
      body: JSON.stringify({ sessionId: SESSION, segmentId: robberyToolUses.segmentId, witness: "w1", utterances }),
    });
    const io = { ...ioFor(ok(robberyToolUses.content)), webhookSecret: () => HOOK };
    const out = handleCartesia(io, req);
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ segmentId: "seg_w1", patchCount: 12, error: undefined });
    expect((out.body as { statuses: unknown[] }).statuses).toContainEqual({ eventId: "e5", status: "implausible" });
    const stored = harness.db.flags.rowKey.find(`${SESSION}/sightline:e5`)!;
    const e5 = (out.body as { hardFlags: { id: string; suggestedQuestion: string }[] }).hardFlags.find((f) => f.id === "sightline:e5");
    expect(e5).toEqual({
      id: "sightline:e5",
      eventId: "e5",
      check: "sightline",
      detail: stored.detail,
      suggestedQuestion: stored.suggestedQuestion,
    });
    expect(e5?.suggestedQuestion).toMatch(/Where exactly were you standing/);
    expect(JSON.parse(JSON.stringify(out.body)).hardFlags).toContainEqual(e5);
  });
  test("the agent asks each new hard flag once: e5's question comes back as askNext, then never again", () => {
    const req = new Request("http://localhost/webhook/cartesia", {
      method: "POST",
      headers: { [SECRET_HEADER]: HOOK },
      body: JSON.stringify({ sessionId: SESSION, segmentId: robberyToolUses.segmentId, witness: "w1", utterances }),
    });
    const out = handleCartesia({ ...ioFor(ok(robberyToolUses.content)), webhookSecret: () => HOOK }, req);
    expect(out.status).toBe(200);
    const stored = harness.db.flags.rowKey.find(`${SESSION}/sightline:e5`)!;
    expect((out.body as { askNext: unknown }).askNext).toEqual({ flagId: "sightline:e5", eventId: "e5", question: stored.suggestedQuestion });
    expect(stored.suggestedQuestion).toMatch(/Where exactly were you standing/);

    const answer = "I was over by the window.";
    const answerId = defaultSegmentId(SESSION, "w1", [{ text: answer }], 2);
    const follow = new Request("http://localhost/webhook/cartesia/record_statement", {
      method: "POST",
      headers: { [SECRET_HEADER]: HOOK },
      body: JSON.stringify({ session_id: SESSION, witness_id: "w1", text: answer }),
    });
    const io = { ...ioFor(ok([toolUse("tu_a", "add_event", { ...walkInput, actor: "witness", sources: [answerId] })])), webhookSecret: () => HOOK };
    const second = handleCartesia(io, follow);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ segmentId: answerId, askNext: null });
    expect((second.body as { hardFlags: { id: string }[] }).hardFlags.map((f) => f.id)).toContain("sightline:e5");
    expect(harness.db.segments.rowKey.find(`${SESSION}/${answerId}`)).toMatchObject({ text: answer, speaker: "witness" });

    const context = handleSceneContext(
      { ...ioFor(ok([])), webhookSecret: () => HOOK },
      new Request("http://localhost/webhook/cartesia/scene_context", {
        method: "POST",
        headers: { [SECRET_HEADER]: HOOK },
        body: JSON.stringify({ session_id: SESSION }),
      }),
    );
    expect(context.body).toMatchObject({ nextQuestion: null });
  });

  test("new hard flags are handed out one at a time, in the gate's order", () => {
    const flag = (eventId: string, seq: number) => ({
      rowKey: `${SESSION}/sightline:${eventId}`,
      sessionId: SESSION,
      eventId,
      seq,
      id: `sightline:${eventId}`,
      check: "sightline",
      severity: "hard",
      detail: "detail the witness never hears",
      evidence: "",
      conflictsWith: undefined,
      suggestedQuestion: `Question about ${eventId}?`,
    });
    const asked: unknown[] = [];
    call((ctx: { db: { flags: { insert: (row: unknown) => void } } }) => {
      ctx.db.flags.insert(flag("e7", 2));
      ctx.db.flags.insert(flag("e3", 1));
    });
    for (let i = 0; i < 3; i++) call((ctx) => void asked.push(takeNextQuestion(ctx, SESSION)));
    expect(asked).toEqual([
      { flagId: "sightline:e3", eventId: "e3", question: "Question about e3?" },
      { flagId: "sightline:e7", eventId: "e7", question: "Question about e7?" },
      null,
    ]);
    expect(JSON.stringify(asked)).not.toContain("detail the witness never hears");
  });
});

describe("who can run extraction", () => {
  const stranger = () =>
    TestAuth.fromJwtPayload(
      JSON.stringify({ iss: "https://auth.example", sub: "stranger", aud: ["spacetimedb"], iat: 0 }),
      ConnectionId.random(),
    );
  const procedure = mod.extractSegment as unknown as (ctx: never, args: { sessionId: string; segmentId: string }) => unknown;

  test("an anonymous caller cannot run extraction", () => {
    const ctx = harness.procedureContextBuilder(stranger()).build();
    expect(ctx.sender.isEqual(ctx.databaseIdentity)).toBe(false);
    const before = graph();
    const run = () => extractAs(ctx, () => ioFor(ok([toolUse("tu_1", "add_event", walkInput)])), SESSION, "utt_2");
    expect(run).toThrow(SenderError);
    expect(run).toThrow(NOT_THE_MODULE);
    expect(() => procedure(ctx as never, { sessionId: SESSION, segmentId: "utt_2" })).toThrow(NOT_THE_MODULE);
    expect(requests).toHaveLength(0);
    expect(graph()).toEqual(before);
    expect(segmentRow()).toMatchObject({ extractedAt: undefined, extractError: undefined, extractModel: undefined });
  });

  test("the module itself can still run extraction", () => {
    const ctx = harness.procedureContext(auth);
    expect(ctx.sender.isEqual(ctx.databaseIdentity)).toBe(true);
    const result = extractAs(ctx, () => ioFor(ok([toolUse("tu_1", "add_event", walkInput)])), SESSION, "utt_2");
    expect(result).toMatchObject({ patchCount: 1, error: undefined });
    expect(requests).toHaveLength(1);
  });

  test("a segment over the text cap never reaches the model", () => {
    const long = "a".repeat(MAX_SEGMENT_TEXT_CHARS + 1);
    insertWitnessSegment("big");
    const stored = harness.db.segments.rowKey.find(`${SESSION}/big`)!;
    harness.withReducerTx(auth, (ctx) => ctx.db.segments.rowKey.update({ ...stored, text: long }));
    const result = runExtraction(ioFor(ok([toolUse("tu_1", "add_event", walkInput)])), SESSION, "big");
    expect(result).toEqual({ segmentId: "big", patchCount: 0, statuses: [], hardFlags: [], error: EXTRACTION_FAILED });
    expect(requests).toHaveLength(0);
    expect(segmentRow("big").extractError).toBe("segment_too_long");
    expect(lastLog()).toBe(`extract_segment s1/big segment_too_long: ${MAX_SEGMENT_TEXT_CHARS + 1} characters, over ${MAX_SEGMENT_TEXT_CHARS}`);
  });

  test("a segment exactly at the text cap is sent", () => {
    const text = "a".repeat(MAX_SEGMENT_TEXT_CHARS);
    call((ctx) =>
      mod.insertSegment(ctx, {
        id: "edge",
        sessionId: SESSION,
        witnessId: "w1",
        speaker: "witness",
        text,
        tStart: 0,
        tEnd: 1,
        source: "upload_text",
        supersedes: undefined,
        utterances: [{ id: "edge_a", text, tStart: 0, tEnd: 1 }],
      }),
    );
    runExtraction(ioFor(ok([toolUse("tu_1", "add_event", walkInput)])), SESSION, "edge");
    expect(requests).toHaveLength(1);
   });
});
