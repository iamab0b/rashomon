import { beforeEach, describe, expect, test, vi } from "vitest";
import { ConnectionId } from "spacetimedb";
import { SenderError } from "spacetimedb/server";
import { TestAuth, createModuleTestHarness } from "spacetimedb/server/test-utils";
import type { TestHttpResponder } from "spacetimedb/server/test-utils";
import { robberyGraph } from "@rashomon/schema/fixtures";
import { runExtraction, type Io } from "./extract/run";
import {
  NOT_THE_MODULE,
  UTHANA_GRAPHQL_URL,
  UTHANA_MODEL,
  base64,
  generateAs,
  runMotionJob,
  type MotionIo,
} from "./motion/generate";
import { MAX_GENERATIONS_PER_SESSION, MAX_MOTION_S, MIN_MOTION_S, motionLength, normalizeVerb } from "./motion/queue";
import * as mod from "./index";
import { spacetimedb } from "./tables";

const auth = TestAuth.internal();
const SESSION = "s1";
const ANTHROPIC_KEY = "sk-test-anthropic";
const UTHANA_KEY = "uthana-test-secret-value";
const CHARACTER = "cTestChar01";

const h = () => createModuleTestHarness(spacetimedb, mod);
let harness: ReturnType<typeof h>;
let uthanaRequests: { url: string; headers: string; body: string }[];
let logged: string[];

const call = (fn: (ctx: never) => unknown) => harness.withReducerTx(auth, fn as never);

const reply = (code: number, body: string): TestHttpResponder<never> => () => ({
  code,
  headers: { entries: [] },
  version: { tag: "Http11" },
  body,
});

const toolUse = (id: string, input: Record<string, unknown>) => ({ type: "tool_use", id, name: "add_event", input });

const approximated = (verb: string, tStart = 2, tEnd = 4, actor = "suspect") => ({
  actor,
  action: "stumble",
  from: null,
  to: null,
  at: { kind: "at", landmark: "counter", second_landmark: null, radius_m: null },
  facing: null,
  target: null,
  prop: null,
  t_start: tStart,
  t_end: tEnd,
  t_confidence: "inferred",
  confidence: "high",
  sources: [],
  actionApproximated: true,
  verb,
});

const extractionIo = (inputs: Record<string, unknown>[]): Io => {
  const body = JSON.stringify({ content: inputs.map((input, i) => toolUse(`tu_${i}`, input)), stop_reason: "tool_use" });
  const ctx = harness.procedureContextBuilder(auth).http(reply(200, body) as never).build();
  return { apiKey: () => ANTHROPIC_KEY, http: ctx.http as never, withTx: (fn) => ctx.withTx(fn as never) as never };
};

const insertSegment = (id: string) =>
  call((ctx) =>
    mod.insertSegment(ctx, {
      id,
      sessionId: SESSION,
      witnessId: "w1",
      speaker: "witness",
      text: "He staggered back against the counter.",
      tStart: 0,
      tEnd: 5,
      source: "upload_text",
      supersedes: undefined,
      utterances: [{ id: `${id}_u`, text: "He staggered back against the counter.", tStart: 0, tEnd: 5 }],
    }),
  );

const extract = (id: string, inputs: Record<string, unknown>[]) => {
  insertSegment(id);
  return runExtraction(extractionIo(inputs.map((input) => ({ ...input, sources: [`${id}_u`] }))), SESSION, id);
};

const motionRows = () =>
  [...harness.db.generatedMotions.sessionId.filter(SESSION)].sort((a, b) => a.verb.localeCompare(b.verb));
const queueRows = () => [...harness.db.motionQueue.iter()].filter((row) => row.sessionId === SESSION);

type EnvRead = string | (() => string);

const uthanaIo = (responder: TestHttpResponder<never>, env: { apiKey?: EnvRead; characterId?: string } = {}): MotionIo => {
  const recording: TestHttpResponder<never> = (testCtx, req, body) => {
    uthanaRequests.push({
      url: req.uri,
      headers: req.headers.entries.map((e) => `${e.name}:${new TextDecoder().decode(e.value as Uint8Array)}`).join("\n"),
      body: new TextDecoder().decode(body),
    });
    return responder(testCtx, req, body);
  };
  const ctx = harness.procedureContextBuilder(auth).http(recording as never).build();
  const apiKey = env.apiKey ?? UTHANA_KEY;
  return {
    apiKey: typeof apiKey === "function" ? apiKey : () => apiKey,
    characterId: () => env.characterId ?? CHARACTER,
    http: ctx.http as never,
    withTx: (fn) => ctx.withTx(fn as never) as never,
  };
};

const motionOk = (id = "mGen0001") =>
  reply(200, JSON.stringify({ data: { create_text_to_motion: { motion: { id, name: "a person staggered" } } } }));

const jobFor = (verb: string) => {
  const row = queueRows().find((q) => q.verb === verb);
  if (!row) throw new Error(`no queued job for ${verb}`);
  return row;
};

beforeEach(() => {
  harness = h();
  uthanaRequests = [];
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
});

describe("normalizeVerb", () => {
  test.each([
    ["Staggered", "staggered"],
    ["  ducked  ", "ducked"],
    ["sort of   LUNGED", "sort of lunged"],
    ["didn't move", "didn't move"],
    ["half-ran", "half-ran"],
  ])("%j becomes %j", (raw, expected) => {
    expect(normalizeVerb(raw)).toBe(expected);
  });

  test.each(["", "   ", "ran!", "run; drop table", "1st", "a".repeat(41), "ran\u0000fast"])("%j is refused", (raw) => {
    expect(normalizeVerb(raw)).toBeUndefined();
  });
});

describe("motion length", () => {
  test("clamps the event duration to the per-motion cap", () => {
    expect(motionLength(0, 10)).toBe(MAX_MOTION_S);
    expect(motionLength(3, 3.2)).toBe(MIN_MOTION_S);
    expect(motionLength(1, 3.5)).toBe(2.5);
    expect(motionLength(Number.NaN, 1)).toBe(MIN_MOTION_S);
  });
});

describe("motion queue", () => {
  test("an extraction that commits an approximated event queues one pending generation", () => {
    extract("seg_a", [approximated("Staggered", 2, 4.5)]);

    expect(motionRows()).toEqual([
      expect.objectContaining({ verb: "staggered", status: "pending", motionId: undefined, characterId: undefined, error: undefined }),
    ]);
    expect(queueRows()).toEqual([expect.objectContaining({ verb: "staggered", lengthS: 2.5 })]);
  });

  test("dedupes by normalized verb within a statement and across statements", () => {
    extract("seg_a", [approximated("staggered"), approximated(" STAGGERED ", 5, 7, "clerk")]);
    extract("seg_b", [approximated("Staggered", 8, 9)]);

    expect(motionRows().map((r) => r.verb)).toEqual(["staggered"]);
    expect(queueRows()).toHaveLength(1);
  });

  test("caps generations at five per session", () => {
    const verbs = ["ducked", "lunged", "staggered", "slumped", "cowered", "sprinted", "tiptoed"];
    extract("seg_a", verbs.slice(0, 3).map((v, i) => approximated(v, i, i + 1)));
    extract("seg_b", verbs.slice(3).map((v, i) => approximated(v, 10 + i, 11 + i)));

    expect(motionRows()).toHaveLength(MAX_GENERATIONS_PER_SESSION);
    expect(queueRows()).toHaveLength(MAX_GENERATIONS_PER_SESSION);
    expect(motionRows().map((r) => r.verb)).toEqual(["cowered", "ducked", "lunged", "slumped", "staggered"]);
  });

  test("a failed generation still counts toward the cap and is not retried", () => {
    extract("seg_a", [approximated("ducked")]);
    runMotionJob(uthanaIo(reply(400, "{}")), jobFor("ducked"));
    extract("seg_b", [approximated("Ducked", 6, 7)]);

    expect(motionRows()).toEqual([expect.objectContaining({ verb: "ducked", status: "failed" })]);
  });

  test("events that are not approximated, or carry an unusable verb, queue nothing", () => {
    const plain = { ...approximated("walked"), actionApproximated: false, verb: null };
    extract("seg_a", [plain, approximated("ran!!")]);

    expect(motionRows()).toEqual([]);
    expect(queueRows()).toEqual([]);
  });
});

describe("run_motion_generation", () => {
  beforeEach(() => {
    extract("seg_a", [approximated("staggered", 0, 3)]);
  });

  test("a create_text_to_motion response writes a ready row", () => {
    const result = runMotionJob(uthanaIo(motionOk("mGen0001")), jobFor("staggered"));

    expect(result).toEqual({ status: "ready", motionId: "mGen0001" });
    expect(motionRows()).toEqual([
      expect.objectContaining({ verb: "staggered", status: "ready", motionId: "mGen0001", characterId: CHARACTER, error: undefined }),
    ]);
  });

  test("the request uses Basic auth, the stored verb as the prompt, the model, the length and the character", () => {
    runMotionJob(uthanaIo(motionOk()), jobFor("staggered"));

    expect(uthanaRequests).toHaveLength(1);
    const [request] = uthanaRequests;
    expect(request!.url).toBe(UTHANA_GRAPHQL_URL);
    expect(request!.headers).toContain(`authorization:Basic ${base64(`${UTHANA_KEY}:`)}`);
    const body = JSON.parse(request!.body) as { query: string; variables: Record<string, unknown> };
    expect(body.query).toContain("create_text_to_motion");
    expect(body.variables).toEqual({ prompt: "a person staggered", model: UTHANA_MODEL, length: 3, character: CHARACTER });
  });

  test.each([
    [400, "rejected"],
    [401, "unauthorized"],
    [403, "unauthorized"],
    [429, "rejected"],
    [500, "server_error"],
  ])("HTTP %i writes failed with code %s", (code, expected) => {
    const result = runMotionJob(uthanaIo(reply(code, `{"detail":"${UTHANA_KEY}"}`)), jobFor("staggered"));

    expect(result).toEqual({ status: "failed", error: expected });
    expect(motionRows()[0]).toMatchObject({ status: "failed", error: expected, motionId: undefined });
    expect(logged.join("\n")).not.toContain(UTHANA_KEY);
  });

  test("a GraphQL error writes failed with api_error and the log never carries the key", () => {
    const body = JSON.stringify({ errors: [{ message: `Invalid model for ${UTHANA_KEY}` }], data: null });

    const result = runMotionJob(uthanaIo(reply(200, body)), jobFor("staggered"));

    expect(result).toEqual({ status: "failed", error: "api_error" });
    expect(logged.join("\n")).toContain("[redacted]");
    expect(logged.join("\n")).not.toContain(UTHANA_KEY);
  });

  test.each([
    ["not json", "bad_response"],
    [JSON.stringify({ data: { create_text_to_motion: { motion: { id: "../../etc" } } } }), "bad_response"],
    [JSON.stringify({ data: {} }), "bad_response"],
  ])("an unusable body %j writes failed with %s", (body, expected) => {
    expect(runMotionJob(uthanaIo(reply(200, body)), jobFor("staggered"))).toEqual({ status: "failed", error: expected });
  });

  test("an empty key fails without a request", () => {
    expect(runMotionJob(uthanaIo(motionOk(), { apiKey: "" }), jobFor("staggered"))).toEqual({ status: "failed", error: "no_api_key" });
    expect(uthanaRequests).toHaveLength(0);
  });

  test("a throwing env read is treated as no key", () => {
    const throwing = (): string => {
      throw new Error("env var missing");
    };

    expect(runMotionJob(uthanaIo(motionOk(), { apiKey: throwing }), jobFor("staggered"))).toMatchObject({ error: "no_api_key" });
    expect(uthanaRequests).toHaveLength(0);
  });

  test("a malformed character id fails without a request", () => {
    expect(runMotionJob(uthanaIo(motionOk(), { characterId: "bad id/.." }), jobFor("staggered"))).toEqual({
      status: "failed",
      error: "no_character",
    });
    expect(uthanaRequests).toHaveLength(0);
  });

  test("a job whose row is no longer pending is skipped without a request", () => {
    const job = jobFor("staggered");
    runMotionJob(uthanaIo(motionOk()), job);

    expect(runMotionJob(uthanaIo(motionOk("mOther")), job)).toEqual({ status: "skipped" });
    expect(uthanaRequests).toHaveLength(1);
    expect(motionRows()[0]).toMatchObject({ motionId: "mGen0001" });
  });

  test("generation never changes an event status", () => {
    const before = [...harness.db.events.sessionId.filter(SESSION)].map((e) => [e.id, e.status]);
    runMotionJob(uthanaIo(motionOk()), jobFor("staggered"));

    expect([...harness.db.events.sessionId.filter(SESSION)].map((e) => [e.id, e.status])).toEqual(before);
  });
});

describe("who can run motion generation", () => {
  const stranger = () =>
    TestAuth.fromJwtPayload(
      JSON.stringify({ iss: "https://auth.example", sub: "stranger", aud: ["spacetimedb"], iat: 0 }),
      ConnectionId.random(),
    );
  const procedure = mod.runMotionGeneration as unknown as (ctx: never, args: { job: unknown }) => unknown;

  beforeEach(() => {
    extract("seg_a", [approximated("staggered")]);
  });

  test("an outside caller is refused before any request", () => {
    const ctx = harness.procedureContextBuilder(stranger()).build();
    expect(ctx.sender.isEqual(ctx.databaseIdentity)).toBe(false);
    const job = jobFor("staggered");

    const run = () => generateAs(ctx, () => uthanaIo(motionOk()), job);

    expect(run).toThrow(SenderError);
    expect(run).toThrow(NOT_THE_MODULE);
    expect(() => procedure(ctx as never, { job })).toThrow(NOT_THE_MODULE);
    expect(uthanaRequests).toHaveLength(0);
    expect(motionRows()[0]).toMatchObject({ status: "pending" });
  });

  test("the module itself can run it", () => {
    const ctx = harness.procedureContext(auth);

    expect(generateAs(ctx, () => uthanaIo(motionOk()), jobFor("staggered"))).toMatchObject({ status: "ready" });
  });
});

describe("base64", () => {
  test.each([
    ["", ""],
    ["f", "Zg=="],
    ["fo", "Zm8="],
    ["foo", "Zm9v"],
    ["key-123:", "a2V5LTEyMzo="],
  ])("%j encodes as %j", (raw, expected) => {
    expect(base64(raw)).toBe(expected);
  });
});
