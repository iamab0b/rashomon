import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { client, listModels, type Client } from "./cartesia";
import { TOOL_NAMES, agentBody, agentConfig, toolDefinition, webhookUrl, type Settings, type ToolName } from "./config";

export const IDS_FILE = fileURLToPath(new URL("../.cartesia-ids.json", import.meta.url));

export type Ids = { tools: Partial<Record<ToolName, string>>; agentId?: string };

export type Store = { load(): Ids; save(ids: Ids): void };

export const fileStore = (path = IDS_FILE): Store => ({
  load: () => (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Ids) : { tools: {} }),
  save: (ids) => writeFileSync(path, `${JSON.stringify(ids, null, 2)}\n`),
});

type Env = Record<string, string | undefined>;

const need = (env: Env, name: string): string => {
  const v = env[name]?.trim();
  if (!v) throw new Error(`${name} is not set; add it to .env.local`);
  return v;
};

export async function pickModel(api: Client, env: Env): Promise<string> {
  const chosen = env.CARTESIA_AGENT_MODEL?.trim();
  if (chosen) return chosen;
  const claude = listModels(await api.models()).find((m) => /anthropic|claude/i.test(`${m.provider} ${m.id}`));
  if (!claude) throw new Error("no Claude model in GET /v1/agents/models; set CARTESIA_AGENT_MODEL");
  return claude.id;
}

export async function settingsFrom(env: Env, api: Client): Promise<Settings> {
  const sessionId = need(env, "RASHOMON_SESSION_ID");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(sessionId)) throw new Error("RASHOMON_SESSION_ID must be 1 to 64 letters, digits, _ or -");
  const s = {
    tunnelUrl: need(env, "RASHOMON_TUNNEL_URL"),
    database: env.SPACETIME_DB?.trim() || "rashomon",
    sessionId,
    witnessId: env.RASHOMON_WITNESS_ID?.trim() || "w1",
    webhookSecret: need(env, "CARTESIA_WEBHOOK_SECRET"),
    voiceId: env.CARTESIA_VOICE_ID?.trim() || undefined,
  };
  webhookUrl(s, "record_statement");
  return { ...s, modelId: await pickModel(api, env) };
}

export async function setup(api: Client, s: Settings, store: Store, log: (line: string) => void): Promise<Ids> {
  const ids = store.load();
  for (const name of TOOL_NAMES) {
    const def = toolDefinition(s, name);
    const existing = ids.tools[name];
    if (existing) {
      const { type: _type, ...patch } = def;
      await api.updateTool(existing, patch);
      log(`updated tool ${name} ${existing} -> ${def.api_schema.url}`);
    } else {
      const created = await api.createTool(def);
      ids.tools[name] = created.id;
      store.save(ids);
      log(`created tool ${name} ${created.id} -> ${def.api_schema.url}`);
    }
  }
  const toolIds = TOOL_NAMES.map((n) => ids.tools[n]!);
  if (ids.agentId) {
    await api.updateAgent(ids.agentId, { config: agentConfig(s, toolIds) });
    log(`updated agent ${ids.agentId} on model ${s.modelId}`);
  } else {
    const agent = await api.createAgent(agentBody(s, toolIds));
    ids.agentId = agent.id;
    store.save(ids);
    log(`created agent ${agent.id} on model ${s.modelId}`);
  }
  return ids;
}

async function main(argv: string[], env: Env): Promise<void> {
  const api = client(need(env, "CARTESIA_API_KEY"), fetch, [env.CARTESIA_WEBHOOK_SECRET ?? ""]);
  if (argv[0] === "models") {
    for (const m of listModels(await api.models())) console.log(`${m.provider}\t${m.id}`);
    return;
  }
  if (argv[0] !== "setup") throw new Error("usage: setup.ts models | setup");
  const s = await settingsFrom(env, api);
  await setup(api, s, fileStore(), console.log);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2), process.env).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
