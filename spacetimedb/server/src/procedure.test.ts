import { beforeEach, describe, expect, test } from "vitest";
import { ConnectionId } from "spacetimedb";
import { Request } from "spacetimedb/server";
import { TestAuth, createModuleTestHarness } from "spacetimedb/server/test-utils";
import type { TestHttpResponder } from "spacetimedb/server/test-utils";
import { robberyGraph } from "@rashomon/schema/fixtures";
import { EXTRACTION_MODEL } from "@rashomon/extractor";
import { MAX_BODY_BYTES, MAX_UTTERANCES, SECRET_HEADER, handleCartesia, secretsMatch } from "./http/cartesia";
import { EXTRACTION_FAILED, PROMPT_HASH, runExtraction, type Io } from "./extract/run";
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

beforeEach(() => {
  harness = h();
  requests = [];
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

  test("the request goes to the Messages API with the key in a header only and a 60 second timeout", () => {
    const result = runExtraction(ioFor(ok([toolUse("tu_1", "add_event", walkInput)])), SESSION, "utt_2");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers).toContain(`x-api-key:${SECRET}`);
    expect(requests[0]?.body).not.toContain(SECRET);
    const body = JSON.parse(requests[0]!.body) as { model: string; tools: unknown[] };
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.tools.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(segmentRow(), (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain(SECRET);
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
    expect(result).toEqual({ segmentId: "utt_2", patchCount: 0, statuses: [], error: EXTRACTION_FAILED });
    expect(segmentRow().extractError).toBe("Anthropic API 500: overloaded");
    expect(segmentRow().extractModel).toBeUndefined();
    expect(graph()).toEqual(before);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  test("a refusal and a response with no tool call are written as errors", () => {
    expect(runExtraction(ioFor(ok([], { stop_reason: "refusal" })), SESSION, "utt_2").error).toBe(EXTRACTION_FAILED);
    expect(segmentRow().extractError).toMatch(/refused/);
    const empty = runExtraction(ioFor(ok([{ type: "text", text: "hello" }])), SESSION, "utt_2");
    expect(empty.error).toBe(EXTRACTION_FAILED);
    expect(segmentRow().extractError).toMatch(/validation failed: the model returned no tool call/);
    expect(graph().events).toEqual([]);
  });

  test("an invalid tool result is rejected by the validator, retried once, and changes nothing", () => {
    const badInput = { ...walkInput, from: at("moon_base") };
    const result = runExtraction(ioFor(ok([toolUse("tu_1", "add_event", badInput)])), SESSION, "utt_2");
    expect(requests).toHaveLength(2);
    expect(JSON.parse(requests[1]!.body).messages).toHaveLength(3);
    expect(result.patchCount).toBe(0);
    expect(result.error).toBe(EXTRACTION_FAILED);
    expect(segmentRow().extractError).toMatch(/^validation failed: add_event:/);
    expect(graph().events).toEqual([]);
    expect(graph().version).toBe(1);
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
    expect(segmentRow().extractError).toMatch(/nobody/);
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
    // e7 is retracted while the model call is in flight, so the batch is valid against the
    // snapshot the model saw but its second patch fails inside applyPatchBatch.
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
    expect(result).toEqual({ segmentId: "utt_2", patchCount: 0, statuses: [], error: EXTRACTION_FAILED });
    expect(segmentRow().extractError).toMatch(/e7 was retracted and cannot be updated/);
    const after = graph();
    expect(before.graph?.version).toBe(3);
    expect(after.version).toBe(3);
    expect(after.events.map((e) => [e.id, e.status])).toEqual(before.graph?.events.map((e) => [e.id, e.status]));
    expect(after).toEqual(before.graph);
    expect(after.events.some((e) => e.actor === "clerk" && e.action === "walk")).toBe(false);
    expect([...harness.db.patches.sessionId.filter(SESSION)]).toHaveLength(before.patches);
    expect(segmentRow().extractedAt).toBeUndefined();
  });

  test("no key, an unknown segment and a non-witness segment never reach the model", () => {
    expect(runExtraction(ioFor(ok([]), ""), SESSION, "utt_2").error).toBe(EXTRACTION_FAILED);
    expect(segmentRow().extractError).toMatch(/ANTHROPIC_API_KEY is not set/);
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

describe("the Cartesia webhook", () => {
  const webhookIo = (responder: TestHttpResponder<never>, secret: string | undefined = HOOK) => ({
    ...ioFor(responder),
    nowMicros: () => 1234n,
    webhookSecret: () => secret,
  });
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
    const io = webhookIo(ok([toolUse("tu_1", "add_event", { ...walkInput, sources: ["seg_1234"] })]));
    const fifty = Array.from({ length: MAX_UTTERANCES }, (_, i) => ({ text: `line ${i}`, tStart: i, tEnd: i + 0.5 }));
    const out = handleCartesia(io, post(body({ utterances: fifty })));
    expect(out.status).toBe(200);
    expect(harness.db.segments.rowKey.find(`${SESSION}/seg_1234`)).toMatchObject({ tStart: 0, tEnd: 49.5 });
  });

  test("the exported handler reads the secret from the module env and checks it first", () => {
    const ctx = { env: { CARTESIA_WEBHOOK_SECRET: HOOK } } as never;
    expect(exported(ctx, post("{}", null)).status).toBe(401);
    expect(exported(ctx, post("{}", "nope")).status).toBe(401);
    expect(exported(ctx, post("{}")).status).toBe(400);
    expect(exported({} as never, post("{}")).status).toBe(401);
  });

  test("a good body inserts the segment, runs the extraction and returns its result", () => {
    const io = webhookIo(ok([toolUse("tu_1", "add_event", { ...walkInput, sources: ["seg_1234"] })]));
    const out = handleCartesia(io, post(body()));
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ segmentId: "seg_1234", patchCount: 1, statuses: [{ eventId: "e1", status: "plausible" }] });
    const row = harness.db.segments.rowKey.find(`${SESSION}/seg_1234`)!;
    expect(row).toMatchObject({ speaker: "witness", witnessId: "w1", source: "live", tStart: 7.8, tEnd: 12 });
    expect(row.extractUtteranceIds).toEqual(["seg_1234_u1"]);
    expect(graph().events).toHaveLength(1);
  });

  test("an extraction error is a 502 with a generic message, and the detail stays on the segment", () => {
    const out = handleCartesia(webhookIo(status(500, JSON.stringify({ error: { message: "overloaded" } }))), post(body()));
    expect(out).toEqual({ status: 502, body: { error: EXTRACTION_FAILED } });
    expect(harness.db.segments.rowKey.find(`${SESSION}/seg_1234`)?.extractError).toBe("Anthropic API 500: overloaded");
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
    const good = toolUse("tu_1", "add_event", { ...walkInput, sources: ["seg_1234"] });
    const badCall = toolUse("tu_2", "add_event", { ...walkInput, from: at("moon_base") });
    let n = 0;
    const responder: TestHttpResponder<never> = (test, req, b) => (n++ === 0 ? ok([good, badCall]) : ok([badCall]))(test, req, b);
    const out = handleCartesia(webhookIo(responder), post(body()));
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ patchCount: 1, error: "extraction partly failed" });
    expect(JSON.stringify(out.body)).not.toContain("moon_base");
    expect(harness.db.segments.rowKey.find(`${SESSION}/seg_1234`)?.extractError).toMatch(/^partly rejected: add_event: .*moon_base/);
  });
});
