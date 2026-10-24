import type { CallModel, ModelRequest, ModelResponse } from "./types";

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

export function createAnthropicCaller(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): CallModel {
  return async (req: ModelRequest): Promise<ModelResponse> => {
    const res = await fetchImpl(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(req),
    });
    if (!res.ok)
      throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    return (await res.json()) as ModelResponse;
  };
}
