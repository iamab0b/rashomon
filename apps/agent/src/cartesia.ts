export const API_BASE = "https://api.cartesia.ai";
export const CARTESIA_VERSION = "2026-08-14";

export type Fetch = typeof fetch;

export class CartesiaError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function client(apiKey: string, fetchImpl: Fetch = fetch, alsoRedact: string[] = []) {
  const redact = (text: string): string =>
    [apiKey, ...alsoRedact].filter((v) => v.length > 0).reduce((t, v) => t.split(v).join("[redacted]"), text);
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetchImpl(`${API_BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "cartesia-version": CARTESIA_VERSION,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    if (!res.ok) throw new CartesiaError(res.status, `${method} ${path} -> ${res.status}: ${redact(text).slice(0, 500)}`);
    return (text === "" ? undefined : JSON.parse(text)) as T;
  };
  return {
    models: () => call<unknown>("GET", "/v1/agents/models"),
    createTool: (tool: unknown) => call<{ id: string }>("POST", "/v1/agents/tools", tool),
    updateTool: (id: string, tool: unknown) => call<{ id: string }>("PATCH", `/v1/agents/tools/${encodeURIComponent(id)}`, tool),
    createAgent: (agent: unknown) => call<{ id: string }>("POST", "/v1/agents", agent),
    updateAgent: (id: string, patch: unknown) => call<{ id: string }>("PATCH", `/v1/agents/${encodeURIComponent(id)}`, patch),
  };
}

export type Client = ReturnType<typeof client>;

export type ModelInfo = { id: string; provider: string };

export function listModels(raw: unknown): ModelInfo[] {
  const rows = Array.isArray(raw) ? raw : Array.isArray((raw as { data?: unknown })?.data) ? (raw as { data: unknown[] }).data : [];
  return rows.flatMap((r) => {
    if (typeof r !== "object" || r === null) return [];
    const { id, provider } = r as { id?: unknown; provider?: unknown };
    return typeof id === "string" ? [{ id, provider: typeof provider === "string" ? provider : "" }] : [];
  });
}
