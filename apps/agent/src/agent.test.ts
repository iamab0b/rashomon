import { describe, expect, test } from "vitest";
import { CARTESIA_VERSION, client, listModels, type Client } from "./cartesia";
import { SECRET_HEADER, TOOL_NAMES, agentBody, toolDefinition, webhookUrl, type Settings } from "./config";
import { INSTRUCTIONS } from "./instructions";
import { settingsFrom, setup, type Ids, type Store } from "./setup";

const settings: Settings = {
  tunnelUrl: "https://example.trycloudflare.com",
  database: "rashomon",
  sessionId: "demo1",
  witnessId: "w1",
  webhookSecret: "whsec-test-value",
  modelId: "claude-test",
  voiceId: undefined,
};

const modelParams = (name: (typeof TOOL_NAMES)[number]) =>
  Object.entries(toolDefinition(settings, name).api_schema.request_body_schema.properties)
    .filter(([, p]) => !("constant_value" in p))
    .map(([k]) => k);

describe("tool definitions", () => {
  test("record_statement lets the model supply only the witness's words", () => {
    expect(modelParams("record_statement")).toEqual(["text"]);
    const def = toolDefinition(settings, "record_statement");
    expect(def.api_schema.request_body_schema.required).toEqual(["text"]);
    expect(def.api_schema.request_body_schema.properties.session_id).toEqual({ type: "string", constant_value: "demo1" });
    expect(def.api_schema.request_body_schema.properties.witness_id).toEqual({ type: "string", constant_value: "w1" });
  });

  test("get_scene_context and end_interview take nothing from the model", () => {
    expect(modelParams("get_scene_context")).toEqual([]);
    expect(modelParams("end_interview")).toEqual([]);
  });

  test("every tool posts to its route with the secret as a Cartesia secret header", () => {
    const urls = TOOL_NAMES.map((n) => toolDefinition(settings, n).api_schema.url);
    expect(urls).toEqual([
      "https://example.trycloudflare.com/v1/database/rashomon/route/webhook/cartesia/record_statement",
      "https://example.trycloudflare.com/v1/database/rashomon/route/webhook/cartesia/scene_context",
      "https://example.trycloudflare.com/v1/database/rashomon/route/webhook/cartesia/end_interview",
    ]);
    for (const n of TOOL_NAMES) {
      const def = toolDefinition(settings, n);
      expect(def.api_schema.method).toBe("POST");
      expect(def.api_schema.request_headers[SECRET_HEADER]).toMatchObject({ type: "secret", secret_value: "whsec-test-value" });
      expect(def.name).toMatch(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
      expect(def.response_timeout_secs).toBeLessThanOrEqual(120);
    }
  });

  test("a tunnel URL that is not https is refused, and a path on it is dropped", () => {
    expect(() => webhookUrl({ ...settings, tunnelUrl: "http://example.com" }, "record_statement")).toThrow(/https/);
    expect(webhookUrl({ ...settings, tunnelUrl: "https://example.com/x/" }, "end_interview")).toBe(
      "https://example.com/v1/database/rashomon/route/webhook/cartesia/end_interview",
    );
  });

  test("the agent gets the instructions, the three tools and end_call", () => {
    const body = agentBody(settings, ["t1", "t2", "t3"]);
    expect(body.config.instructions).toBe(INSTRUCTIONS);
    expect(body.config.instructions).toContain("call record_statement with their words verbatim");
    expect(body.config.tools).toEqual([{ id: "t1" }, { id: "t2" }, { id: "t3" }]);
    expect(body.config.system_tools).toEqual({ end_call: {} });
    expect(body.config.model).toEqual({ id: "claude-test" });
    expect(body.config.audio.input.keyterms).toContain("front door");
    expect(JSON.stringify(body)).not.toContain("whsec-test-value");
  });
});

type Call = { op: string; id?: string; body: unknown };

const fakeApi = (calls: Call[], models: unknown = []): Client => {
  let n = 0;
  return {
    models: async () => models,
    createTool: async (body) => (calls.push({ op: "createTool", body }), { id: `tool_${++n}` }),
    updateTool: async (id, body) => (calls.push({ op: "updateTool", id, body }), { id }),
    createAgent: async (body) => (calls.push({ op: "createAgent", body }), { id: "agent_1" }),
    updateAgent: async (id, body) => (calls.push({ op: "updateAgent", id, body }), { id }),
  };
};

const memoryStore = (): Store & { ids: Ids } => {
  const s = { ids: { tools: {} } as Ids, load: () => structuredClone(s.ids), save: (ids: Ids) => void (s.ids = structuredClone(ids)) };
  return s;
};

describe("setup", () => {
  test("the first run creates the three tools and an agent that uses them; the second run updates them in place", async () => {
    const calls: Call[] = [];
    const store = memoryStore();
    await setup(fakeApi(calls), settings, store, () => {});
    expect(calls.map((c) => c.op)).toEqual(["createTool", "createTool", "createTool", "createAgent"]);
    expect((calls[3]!.body as { config: { tools: unknown } }).config.tools).toEqual([{ id: "tool_1" }, { id: "tool_2" }, { id: "tool_3" }]);
    expect(store.ids).toEqual({ tools: { record_statement: "tool_1", get_scene_context: "tool_2", end_interview: "tool_3" }, agentId: "agent_1" });

    calls.length = 0;
    await setup(fakeApi(calls), settings, store, () => {});
    expect(calls.map((c) => `${c.op}:${c.id}`)).toEqual(["updateTool:tool_1", "updateTool:tool_2", "updateTool:tool_3", "updateAgent:agent_1"]);
    expect(calls[0]!.body).not.toHaveProperty("type");
    expect(calls[3]!.body).toMatchObject({ config: { tools: [{ id: "tool_1" }, { id: "tool_2" }, { id: "tool_3" }] } });
  });

  test("the log never contains the webhook secret", async () => {
    const lines: string[] = [];
    await setup(fakeApi([]), settings, memoryStore(), (l) => lines.push(l));
    expect(lines).toHaveLength(4);
    expect(lines.join("\n")).not.toContain("whsec-test-value");
  });

  test("settings need the session, tunnel and secret, and pick a Claude model when none is set", async () => {
    const env = { RASHOMON_SESSION_ID: "demo1", RASHOMON_TUNNEL_URL: "https://x.trycloudflare.com", CARTESIA_WEBHOOK_SECRET: "s" };
    const api = fakeApi([], { data: [{ id: "gpt-x", provider: "openai" }, { id: "claude-y", provider: "anthropic" }] });
    await expect(settingsFrom(env, api)).resolves.toMatchObject({ modelId: "claude-y", database: "rashomon", witnessId: "w1" });
    await expect(settingsFrom({ ...env, CARTESIA_AGENT_MODEL: "pinned" }, api)).resolves.toMatchObject({ modelId: "pinned" });
    await expect(settingsFrom({ ...env, CARTESIA_WEBHOOK_SECRET: "" }, api)).rejects.toThrow(/CARTESIA_WEBHOOK_SECRET/);
    await expect(settingsFrom({ ...env, RASHOMON_SESSION_ID: "a b" }, api)).rejects.toThrow(/RASHOMON_SESSION_ID/);
    await expect(settingsFrom({ ...env, RASHOMON_TUNNEL_URL: "http://x" }, api)).rejects.toThrow(/https/);
    await expect(settingsFrom(env, fakeApi([], []))).rejects.toThrow(/no Claude model/);
  });
});

describe("the Cartesia client", () => {
  test("sends the pinned version and the key as a bearer token, and redacts secrets from errors", async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const fakeFetch = (async (url: string, init: { headers: Record<string, string> }) => {
      seen.push({ url, headers: init.headers });
      return new Response("bad header sk_car_key and whsec-test-value", { status: 422 });
    }) as unknown as typeof fetch;
    const api = client("sk_car_key", fakeFetch, ["whsec-test-value"]);
    const err = await api.createTool({}).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).toBe("POST /v1/agents/tools -> 422: bad header [redacted] and [redacted]");
    expect(seen[0]).toMatchObject({
      url: "https://api.cartesia.ai/v1/agents/tools",
      headers: { authorization: "Bearer sk_car_key", "cartesia-version": CARTESIA_VERSION },
    });
  });

  test("model lists are read whether or not they are wrapped in data", () => {
    expect(listModels([{ id: "a", provider: "anthropic" }])).toEqual([{ id: "a", provider: "anthropic" }]);
    expect(listModels({ data: [{ id: "b" }, 7, null] })).toEqual([{ id: "b", provider: "" }]);
    expect(listModels("nope")).toEqual([]);
  });
});
