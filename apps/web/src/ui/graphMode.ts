export type GraphMode = "fixture" | "live";

export const GRAPH_MODES: readonly GraphMode[] = ["fixture", "live"];

export function parseMode(search: string): GraphMode {
  return new URLSearchParams(search).get("mode") === "live" ? "live" : "fixture";
}

export function searchWithMode(search: string, mode: GraphMode): string {
  const params = new URLSearchParams(search);
  params.set("mode", mode);
  return `?${params.toString()}`;
}
