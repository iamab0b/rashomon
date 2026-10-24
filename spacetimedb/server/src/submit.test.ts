import { beforeEach, describe, expect, test } from "vitest";
import { ConnectionId } from "spacetimedb";
import { Request } from "spacetimedb/server";
import { TestAuth, createModuleTestHarness } from "spacetimedb/server/test-utils";
import type { TestHttpResponder } from "spacetimedb/server/test-utils";
import { robberyGraph } from "@rashomon/schema/fixtures";
import robberyToolUses from "./fixtures/robbery.tool-uses.json";
import { editorList, isEditor } from "./editors";
import { eventGraphFromRow } from "./convert";
import type { Io } from "./extract/run";
import { SECRET_HEADER, handleCartesia } from "./http/cartesia";
import { MAX_SEGMENT_TEXT_CHARS } from "./limits";
import { NOT_THE_MODULE } from "./procedures/extractSegment";
import { runQueuedAs } from "./procedures/runQueuedExtraction";
import * as mod from "./index";
import { spacetimedb } from "./tables";

const auth = TestAuth.internal();
const jwt = (sub: string) => TestAuth.fromJwtPayload(JSON.stringify({ iss: "https://example.test", sub }), ConnectionId.random());
const stranger = jwt("stranger");
const editor = jwt("editor");
const SESSION = "s1";
const HOOK = "whsec-test-value";
const STATEMENT = "I stepped to the front by the window and saw him clearly.";

const h = () => createModuleTestHarness(spacetimedb, mod);
let harness: ReturnType<typeof h>;
let requests: string[];

const hexOf = (who: TestAuth): string => {
  let hex = "";
  harness.withReducerTx(who, ((ctx: { sender: { toHexString(): string } }) => {
    hex = ctx.sender.toHexString();
  }) as never);
  return hex;
};

const withEnv = <T extends object>(ctx: T, env: Record<string, string>): T =>
  new Proxy(ctx, { get: (target, prop) => (prop === "env" ? env : Reflect.get(target, prop, target)) });

const as = (who: TestAuth, editors: string, fn: (ctx: never) => unknown) =>
  harness.withReducerTx(who, ((ctx: object) => fn(withEnv(ctx, { EDITOR_IDENTITIES: editors }) as never)) as never);

const segmentArgs = (over: Record<string, unknown> = {}) => ({
  id: "seg1",
  sessionId: SESSION,
  witnessId: "w1",
  speaker: "witness",
  text: "He came in through the front door.",
  tStart: 0,
  tEnd: 4,
  source: "live",
  supersedes: undefined,
  utterances: [{ id: "utt_1", text: "He came in through the front door.", tStart: 0, tEnd: 4 }],
  ...over,
});

const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({ type: "tool_use", id, name, input });

const respond = (content: unknown[]): TestHttpResponder<never> => () => ({
  code: 200,
  headers: { entries: [] },
  version: { tag: "Http11" },
  body: JSON.stringify({ content, stop_reason: "tool_use" }),
});

const ioFor = (responder: TestHttpResponder<never>): Io => {
  const recording: TestHttpResponder<never> = (test, req, body) => {
    requests.push(new TextDecoder().decode(body));
    return responder(test, req, body);
  };
  const ctx = harness.procedureContextBuilder(auth).http(recording as never).build();
  return { apiKey: () => "sk-test", http: ctx.http as never, withTx: (body) => ctx.withTx(body as never) as never };
};

const graph = () =>
  eventGraphFromRow(mod.graphForScene(harness.anonymousViewContext(), { sessionId: SESSION }) as never);

const submit = (who: TestAuth, editors: string, text = STATEMENT, name = "Maria") =>
  as(who, editors, (ctx) => mod.submitStatement(ctx, { sessionId: SESSION, text, witnessName: name }));

const queueRows = () => [...harness.db.extractionQueue.iter()];

beforeEach(() => {
  harness = h();
  requests = [];
  harness.withReducerTx(auth, ((ctx: never) => mod.createSession(ctx, { id: SESSION, sceneId: robberyGraph.sceneId })) as never);
  harness.withReducerTx(auth, ((ctx: never) =>
    mod.applyPatches(ctx, {
      sessionId: SESSION,
      baseVersion: 0,
      patchesJson: JSON.stringify(robberyGraph.actors.map((actor) => ({ op: "add_actor", actor }))),
    })) as never);
});

describe("editor identities", () => {
  test("the list ignores whitespace, case and a 0x prefix, and an empty list allows only the module", () => {
    expect([...editorList(" AbC , 0xDEF,, ")]).toEqual(["abc", "def"]);
    expect(editorList(undefined).size).toBe(0);
    const ctx = (sender: string, env: unknown) =>
      ({ sender: { isEqual: () => false, toHexString: () => sender }, databaseIdentity: {}, env }) as never;
    expect(isEditor(ctx("ab", { EDITOR_IDENTITIES: "" }))).toBe(false);
    expect(isEditor(ctx("ab", { EDITOR_IDENTITIES: "xx, AB" }))).toBe(true);
    expect(isEditor(ctx("ab", {}))).toBe(false);
    const throwing = new Proxy({}, { get: () => { throw new Error("no env"); } });
    expect(isEditor(ctx("ab", throwing))).toBe(false);
  });
});

describe("insert_segment is for editors", () => {
  test("an outside identity cannot insert a segment", () => {
    expect(() => as(stranger, "", (ctx) => mod.insertSegment(ctx, segmentArgs()))).toThrow(/only editors can add statements/);
    expect(() => as(stranger, hexOf(editor), (ctx) => mod.insertSegment(ctx, segmentArgs()))).toThrow(/only editors/);
    expect(harness.db.segments.rowKey.find(`${SESSION}/seg1`)).toBeNull();
    as(editor, hexOf(editor), (ctx) => mod.insertSegment(ctx, segmentArgs()));
    expect(harness.db.segments.rowKey.find(`${SESSION}/seg1`)).not.toBeNull();
    as(auth, "", (ctx) => mod.insertSegment(ctx, segmentArgs({ id: "seg2", utterances: [{ id: "utt_2", text: "x", tStart: 0, tEnd: 1 }] })));
    expect(harness.db.segments.rowKey.find(`${SESSION}/seg2`)).not.toBeNull();
  });

  test("the check comes before any other, so an outside identity learns nothing about the session", () => {
    expect(() => as(stranger, "", (ctx) => mod.insertSegment(ctx, segmentArgs({ sessionId: "nope", speaker: "narrator" })))).toThrow(
      /only editors/,
    );
  });
});

describe("submit_statement", () => {
  test("an outside identity cannot submit", () => {
    expect(() => submit(stranger, "")).toThrow(/only editors can add statements/);
    expect(() => submit(stranger, hexOf(editor))).toThrow(/only editors/);
    expect([...harness.db.segments.iter()]).toEqual([]);
    expect(queueRows()).toEqual([]);
  });

  test("an editor's submit inserts one witness segment, one utterance and exactly one queue row", () => {
    submit(editor, hexOf(editor));
    const [segment] = [...harness.db.segments.iter()];
    expect(segment).toMatchObject({
      sessionId: SESSION,
      witnessId: "Maria",
      speaker: "witness",
      text: STATEMENT,
      source: "upload_text",
      tStart: 0,
    });
    expect(segment?.id).toMatch(/^seg_[0-9a-f]{16}$/);
    expect(segment?.tEnd).toBeCloseTo(Math.max(1, STATEMENT.split(" ").length / 15), 9);
    expect(segment?.extractedAt).toBeUndefined();
    const utterances = [...harness.db.utterances.iter()];
    expect(utterances).toHaveLength(1);
    expect(utterances[0]).toMatchObject({ segmentKey: `${SESSION}/${segment?.id}`, text: STATEMENT });
    const rows = queueRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sessionId: SESSION, segmentId: segment?.id });
    expect(rows[0]?.scheduledAt.tag).toBe("Time");
    expect(requests).toEqual([]);
  });

  test("a second statement starts where the last utterance ended and a long one lasts a second per 15 words", () => {
    submit(editor, hexOf(editor));
    const first = [...harness.db.segments.iter()][0]!;
    const long = Array.from({ length: 45 }, (_, i) => `word${i}`).join(" ");
    submit(editor, hexOf(editor), long);
    const second = [...harness.db.segments.iter()].find((s) => s.id !== first.id)!;
    expect(second.tStart).toBeCloseTo(first.tEnd, 9);
    expect(second.tEnd - second.tStart).toBeCloseTo(3, 9);
    expect(queueRows()).toHaveLength(2);
  });

  test("a second identical submit inserts no second segment and no second queue row", () => {
    submit(editor, hexOf(editor));
    submit(editor, hexOf(editor));
    submit(editor, hexOf(editor), `  ${STATEMENT}  `);
    expect([...harness.db.segments.iter()]).toHaveLength(1);
    expect([...harness.db.utterances.iter()]).toHaveLength(1);
    expect(queueRows()).toHaveLength(1);
  });

  test("an empty text, a text over the extraction limit, a bad name and an unknown session are refused", () => {
    const list = hexOf(editor);
    expect(() => submit(editor, list, "   ")).toThrow(/must not be empty/);
    expect(() => submit(editor, list, "x".repeat(MAX_SEGMENT_TEXT_CHARS + 1))).toThrow(/at most 32000 characters/);
    expect(() => submit(editor, list, STATEMENT, "  ")).toThrow(/witness name/);
    expect(() => submit(editor, list, STATEMENT, "n".repeat(65))).toThrow(/witness name/);
    expect(() => as(editor, list, (ctx) => mod.submitStatement(ctx, { sessionId: "nope", text: STATEMENT, witnessName: "M" }))).toThrow(
      /unknown session/,
    );
    expect([...harness.db.segments.iter()]).toEqual([]);
    expect(queueRows()).toEqual([]);
    submit(editor, list, "x".repeat(MAX_SEGMENT_TEXT_CHARS), "n".repeat(64));
    expect(queueRows()).toHaveLength(1);
  });
});

describe("the queued extraction", () => {
  const runQueue = (io: Io) => {
    const [row] = queueRows();
    runQueuedAs({ sender: harness.moduleIdentity, databaseIdentity: harness.moduleIdentity }, () => io, row!);
    return row!;
  };

  test("running the queued job with a faked model applies the patches and the gate, and records the result on the segment", () => {
    submit(editor, hexOf(editor), "A guy came in the front door and went straight up to the counter. He had a knife and I looked up.");
    const row = queueRows()[0]!;
    const content = JSON.parse(JSON.stringify(robberyToolUses.content).split(robberyToolUses.segmentId).join(row.segmentId));
    runQueue(ioFor(respond(content)));
    const g = graph();
    expect(g.events.map((e) => e.id)).toEqual(robberyGraph.events.map((e) => e.id));
    expect(g.events.find((e) => e.id === "e5")).toMatchObject({ status: "implausible" });
    expect(g.events.filter((e) => e.status === "implausible").map((e) => e.id)).toEqual(["e5"]);
    const segment = harness.db.segments.rowKey.find(`${SESSION}/${row.segmentId}`)!;
    expect(segment.extractedAt).toBeDefined();
    expect(segment.extractPatchCount).toBe(12);
    expect(segment.extractError).toBeUndefined();
    expect(requests).toHaveLength(1);
  });

  test("a failed model call leaves the graph alone and puts a short code on the segment", () => {
    submit(editor, hexOf(editor));
    const row = queueRows()[0]!;
    runQueue(ioFor(() => ({ code: 500, headers: { entries: [] }, version: { tag: "Http11" }, body: "{}" })));
    expect(graph().events).toEqual([]);
    const segment = harness.db.segments.rowKey.find(`${SESSION}/${row.segmentId}`)!;
    expect(segment.extractError).toBe("model_error");
    expect(segment.extractedAt).toBeUndefined();
  });

  test("the queued run refuses any sender but the module", () => {
    submit(editor, hexOf(editor));
    const row = queueRows()[0]!;
    let outsider: unknown;
    harness.withReducerTx(stranger, ((ctx: { sender: unknown }) => {
      outsider = ctx.sender;
    }) as never);
    expect(() => runQueuedAs({ sender: outsider as never, databaseIdentity: harness.moduleIdentity }, () => ioFor(respond([])), row)).toThrow(
      NOT_THE_MODULE,
    );
    expect(requests).toEqual([]);
  });
});

describe("the webhook still works with no editors listed", () => {
  const post = (text: string) =>
    new Request("http://localhost/webhook/cartesia", { method: "POST", body: text, headers: { [SECRET_HEADER]: HOOK } });
  const webhookIo = (responder: TestHttpResponder<never>) => ({
    ...ioFor(responder),
    nowMicros: () => 1234n,
    webhookSecret: () => HOOK,
  });

  test("a 40,000 byte body of plain text under the character cap is stored and extracted end to end", () => {
    const text = "a".repeat(30_000);
    const body = JSON.stringify({
      sessionId: SESSION,
      witness: "w1",
      pad: "p".repeat(10_000),
      utterances: [{ text, tStart: 0, tEnd: 30 }],
    });
    expect(new TextEncoder().encode(body).length).toBeGreaterThanOrEqual(40_000);
    const walk = {
      actor: "suspect",
      action: "walk",
      from: { kind: "at", landmark: "front_door", second_landmark: null, radius_m: null },
      to: { kind: "near", landmark: "counter", second_landmark: null, radius_m: 0.6 },
      at: null,
      facing: null,
      target: null,
      prop: null,
      t_start: 0,
      t_end: 5,
      t_confidence: "inferred",
      confidence: "high",
      sources: ["seg_1234"],
    };
    const out = handleCartesia(webhookIo(respond([toolUse("tu_1", "add_event", walk)])), post(body));
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ segmentId: "seg_1234", patchCount: 1 });
    expect(harness.db.segments.rowKey.find(`${SESSION}/seg_1234`)?.text).toHaveLength(30_000);
    expect(graph().events).toHaveLength(1);
  });

  test("a body whose text is over the character cap is refused with a 400", () => {
    const body = JSON.stringify({
      sessionId: SESSION,
      witness: "w1",
      utterances: [{ text: "a".repeat(MAX_SEGMENT_TEXT_CHARS + 1), tStart: 0, tEnd: 30 }],
    });
    expect(handleCartesia(webhookIo(respond([])), post(body)).status).toBe(400);
    expect([...harness.db.segments.iter()]).toEqual([]);
  });
});
