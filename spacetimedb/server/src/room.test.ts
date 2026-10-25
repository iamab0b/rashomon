import { beforeEach, describe, expect, test } from "vitest";
import { ConnectionId } from "spacetimedb";
import { TestAuth, createModuleTestHarness } from "spacetimedb/server/test-utils";
import type { TestHttpResponder } from "spacetimedb/server/test-utils";
import { EXTRACTOR_TOOLS } from "@rashomon/extractor";
import type { Patch } from "@rashomon/schema";
import stairwellJson from "../../../packages/schema/fixtures/stairwell.graph.json";
import { eventGraphFromRow } from "./convert";
import type { Io } from "./extract/run";
import { runQueuedAs } from "./procedures/runQueuedExtraction";
import * as mod from "./index";
import { spacetimedb } from "./tables";

const auth = TestAuth.internal();
const editor = TestAuth.fromJwtPayload(JSON.stringify({ iss: "https://example.test", sub: "editor" }), ConnectionId.random());
const SESSION = "room1";

const h = () => createModuleTestHarness(spacetimedb, mod);
let harness: ReturnType<typeof h>;
let requests: string[];

const call = (fn: (ctx: never) => unknown) => harness.withReducerTx(auth, fn as never);

const hexOf = (who: TestAuth): string => {
  let hex = "";
  harness.withReducerTx(who, ((ctx: { sender: { toHexString(): string } }) => {
    hex = ctx.sender.toHexString();
  }) as never);
  return hex;
};

const asEditor = (who: TestAuth, fn: (ctx: never) => unknown) => {
  const editors = hexOf(who);
  return harness.withReducerTx(who, ((ctx: object) =>
    fn(new Proxy(ctx, { get: (target, prop) => (prop === "env" ? { EDITOR_IDENTITIES: editors } : Reflect.get(target, prop, target)) }) as never)) as never);
};

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

const graph = () => eventGraphFromRow(mod.graphForScene(harness.anonymousViewContext(), { sessionId: SESSION }) as never);

const landmarksBlock = (body: string): string => {
  const request = JSON.parse(body) as { messages: { content: { text: string }[] }[] };
  const text = request.messages[0]!.content[0]!.text;
  return text.slice(text.indexOf("LANDMARKS\n"), text.indexOf("\n\nACTORS\n"));
};

const isUnion = (schema: Record<string, unknown>): boolean => Array.isArray(schema.anyOf) || Array.isArray(schema.type);

const countUnions = (schema: Record<string, unknown>): number => {
  const properties = Object.values((schema.properties ?? {}) as Record<string, Record<string, unknown>>);
  const branches = (schema.anyOf ?? []) as Record<string, unknown>[];
  const items = schema.items && typeof schema.items === "object" ? [schema.items as Record<string, unknown>] : [];
  return (
    properties.reduce((n, p) => n + (isUnion(p) ? 1 : 0) + countUnions(p), 0) +
    [...branches, ...items].reduce((n, b) => n + countUnions(b), 0)
  );
};

beforeEach(() => {
  harness = h();
  requests = [];
});

describe("room_v1 in the module", () => {
  test("create_session with room_v1 succeeds", () => {
    call((ctx) => mod.createSession(ctx, { id: SESSION, sceneId: "room_v1" }));
    expect(harness.db.sessions.id.find(SESSION)?.sceneId).toBe("room_v1");
  });

  test("submit_statement on a room_v1 session extracts against the stairwell landmarks, with the same tools as store_v1", () => {
    call((ctx) => mod.createSession(ctx, { id: SESSION, sceneId: "room_v1" }));
    asEditor(editor, (ctx) => mod.submitStatement(ctx, { sessionId: SESSION, text: "I was at the top of the stairs and saw him by the south window.", witnessName: "Ana" }));
    const [row] = [...harness.db.extractionQueue.iter()];
    runQueuedAs({ sender: harness.moduleIdentity, databaseIdentity: harness.moduleIdentity }, () => ioFor(respond([])), row!);
    expect(requests).not.toHaveLength(0);
    const block = landmarksBlock(requests[0]!);
    expect(block).toContain("- ladder: ladder");
    expect(block).toContain("- window_s: south window");
    expect(block).toContain("- stairs_top: top of the stairs");
    expect(block).not.toMatch(/counter/);
    const tools = (JSON.parse(requests[0]!) as { tools: unknown }).tools;
    expect(tools).toEqual(JSON.parse(JSON.stringify(EXTRACTOR_TOOLS)));
    const strict = EXTRACTOR_TOOLS.filter((t) => t.strict);
    expect(strict.reduce((n, t) => n + countUnions(t.input_schema as Record<string, unknown>), 0)).toBeLessThanOrEqual(16);
  });

  test("a witness look from stairs_top at an actor by window_s gets a hard sightline flag naming the ladder", () => {
    call((ctx) => mod.createSession(ctx, { id: SESSION, sceneId: "room_v1" }));
    const patches: Patch[] = [
      ...stairwellJson.actors.map((actor) => ({ op: "add_actor", actor }) as Patch),
      ...stairwellJson.events.map((e) => {
        const { status: _s, flags: _f, ...event } = e;
        return { op: "add_event", event } as unknown as Patch;
      }),
    ];
    call((ctx) => mod.applyPatches(ctx, { sessionId: SESSION, baseVersion: 0, patchesJson: JSON.stringify(patches) }));
    const look = graph().events.find((e) => e.id === "w2e")!;
    expect(look.status).toBe("implausible");
    const flag = look.flags.find((f) => f.check === "sightline");
    expect(flag?.severity).toBe("hard");
    expect(flag?.detail).toContain("ladder");
  });
});
