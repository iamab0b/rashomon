import { beforeEach, describe, expect, test } from "vitest";
import { ConnectionId } from "spacetimedb";
import { TestAuth, createModuleTestHarness } from "spacetimedb/server/test-utils";
import type { TestHttpResponder } from "spacetimedb/server/test-utils";
import { robberyGraph } from "@rashomon/schema/fixtures";
import type { Patch } from "@rashomon/schema";
import { NOT_AN_EDITOR, NOT_AN_EDITOR_EDIT } from "./editors";
import { runExtraction, type Io } from "./extract/run";
import * as mod from "./index";
import { spacetimedb } from "./tables";

const auth = TestAuth.internal();
const jwt = (sub: string) =>
  TestAuth.fromJwtPayload(JSON.stringify({ iss: "https://example.test", sub }), ConnectionId.random());
const stranger = jwt("stranger");
const editor = jwt("editor");
const SESSION = "s1";
const REASON = "witness later confirmed the view";

const h = () => createModuleTestHarness(spacetimedb, mod);
let harness: ReturnType<typeof h>;

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

const loadPatches = (): Patch[] => [
  ...robberyGraph.actors.map((actor): Patch => ({ op: "add_actor", actor })),
  ...robberyGraph.props.map((prop): Patch => ({ op: "add_prop", prop })),
  ...robberyGraph.events.map((e): Patch => {
    const { status: _s, flags: _f, ...event } = e;
    return { op: "add_event", event };
  }),
];

const send = (who: TestAuth, editors: string, patches: Patch[], baseVersion: number) =>
  as(who, editors, (ctx) => mod.applyPatches(ctx, { sessionId: SESSION, baseVersion, patchesJson: JSON.stringify(patches) }));

const sendOverride = (who: TestAuth, editors: string) =>
  as(who, editors, (ctx) => mod.override(ctx, { sessionId: SESSION, eventId: "e5", reason: REASON, by: "Investigator Ruiz" }));

const overridePatch: Patch = { op: "override", id: "e5", reason: REASON, by: "Investigator Ruiz" };

const session = () => harness.db.sessions.id.find(SESSION)!;
const snapshot = () =>
  JSON.stringify({
    version: session().version,
    events: [...harness.db.events.iter()],
    patches: [...harness.db.patches.iter()],
    overrides: [...harness.db.overrides.iter()],
  }, (_key, value) => (typeof value === "bigint" ? value.toString() : value));

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

beforeEach(() => {
  harness = h();
  harness.withReducerTx(auth, ((ctx: never) => mod.createSession(ctx, { id: SESSION, sceneId: robberyGraph.sceneId })) as never);
  send(auth, "", loadPatches(), 0);
});

describe("apply_patches and override are for editors", () => {
  test("a non-editor is refused by both reducers and nothing changes", () => {
    const before = snapshot();
    const version = session().version;
    const move: Patch = { op: "update_event", id: "e1", changes: { confidence: 0.3 }, sources: ["utt_1"] } as never;
    expect(() => send(stranger, "", [move], version)).toThrow(NOT_AN_EDITOR_EDIT);
    expect(() => send(stranger, hexOf(editor), [move], version)).toThrow(NOT_AN_EDITOR_EDIT);
    expect(() => sendOverride(stranger, "")).toThrow(NOT_AN_EDITOR_EDIT);
    expect(() => sendOverride(stranger, hexOf(editor))).toThrow(NOT_AN_EDITOR_EDIT);
    expect(snapshot()).toBe(before);
    expect(session().version).toBe(version);
  });

  test("an override patch inside apply_patches from a non-editor is refused too", () => {
    const before = snapshot();
    expect(() => send(stranger, "", [overridePatch], session().version)).toThrow(NOT_AN_EDITOR_EDIT);
    expect(snapshot()).toBe(before);
  });

  test("the check comes first: a stale version, bad JSON and an unknown session tell a non-editor nothing", () => {
    expect(() => send(stranger, "", [], 99)).toThrow(NOT_AN_EDITOR_EDIT);
    expect(() =>
      as(stranger, "", (ctx) => mod.applyPatches(ctx, { sessionId: "nope", baseVersion: 0, patchesJson: "{" })),
    ).toThrow(NOT_AN_EDITOR_EDIT);
    expect(() =>
      as(stranger, "", (ctx) => mod.override(ctx, { sessionId: "nope", eventId: "x", reason: "", by: "" })),
    ).toThrow(NOT_AN_EDITOR_EDIT);
  });

  test("the statement refusal keeps its own message", () => {
    expect(NOT_AN_EDITOR).toBe("only editors can add statements");
    expect(NOT_AN_EDITOR_EDIT).toBe("only editors can change the event graph");
  });

  test("an identity in EDITOR_IDENTITIES succeeds, with mixed case and a 0x prefix", () => {
    const hex = hexOf(editor);
    const listed = ` 0x${hex.toUpperCase()} , ffff`;
    const first = session().version;
    send(editor, listed, [{ op: "update_event", id: "e1", changes: { confidence: 0.3 }, sources: ["utt_1"] } as never], first);
    expect(session().version).toBe(first + 1);
    sendOverride(editor, `0X${hex}`);
    expect(harness.db.overrides.rowKey.find(`${SESSION}/e5`)).not.toBeNull();
  });

  test("an editor can also send an override patch inside apply_patches", () => {
    send(editor, hexOf(editor), [overridePatch], session().version);
    expect(harness.db.overrides.rowKey.find(`${SESSION}/e5`)).not.toBeNull();
  });

  test("the module identity succeeds with no editor list", () => {
    const version = session().version;
    send(auth, "", [{ op: "update_event", id: "e1", changes: { confidence: 0.3 }, sources: ["utt_1"] } as never], version);
    expect(session().version).toBe(version + 1);
    sendOverride(auth, "");
    expect(harness.db.overrides.rowKey.find(`${SESSION}/e5`)).not.toBeNull();
  });

  test("an extraction run still commits its patches as the module", () => {
    harness.withReducerTx(auth, ((ctx: never) =>
      mod.insertSegment(ctx, {
        id: "utt_2",
        sessionId: SESSION,
        witnessId: "w1",
        speaker: "witness",
        text: "He walked to the counter.",
        tStart: 0,
        tEnd: 5,
        source: "upload_text",
        supersedes: undefined,
        utterances: [{ id: "utt_2", text: "He walked to the counter.", tStart: 0, tEnd: 5 }],
      })) as never);
    const version = session().version;
    const result = runExtraction(ioFor(respond([toolUse("tu_1", "add_event", walkInput)])), SESSION, "utt_2");
    expect(result).toMatchObject({ patchCount: 1, error: undefined });
    expect(session().version).toBe(version + 1);
  });
});
