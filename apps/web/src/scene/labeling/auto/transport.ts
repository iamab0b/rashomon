import type { LandmarkPayload } from "./payload";
import { validateProposals, type ValidatedProposals } from "./tool";

export const SUGGEST_ROUTE: string | null = import.meta.env.DEV ? "/__landmarks" : null;
export const NEEDS_DEV_SERVER = "Suggest landmarks needs the dev server";

export type SuggestTransport = (payload: LandmarkPayload, signal: AbortSignal) => Promise<ValidatedProposals>;

export class SuggestError extends Error {}

const STATUS_MESSAGES: Record<number, string> = {
  403: "Suggestions only work from localhost",
  409: "A suggestion is already running",
  413: "The views were too large to send",
  503: "The dev server has no ANTHROPIC_API_KEY",
};

export function devTransport(route: string | null = SUGGEST_ROUTE, fetchImpl: typeof fetch = (url, init) => fetch(url, init)): SuggestTransport | null {
  if (route === null) return null;
  return async (payload, signal) => {
    const res = await fetchImpl(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) throw new SuggestError(STATUS_MESSAGES[res.status] ?? "The suggestion failed; see the dev server terminal");
    const result = validateProposals(await res.json(), payload.candidates.map((c) => c.id));
    return result;
  };
}
