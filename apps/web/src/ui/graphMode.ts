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

export type ModeBadge = { label: string; tone: "amber" | "green" | "red" };

export function modeBadge(mode: GraphMode, hasGraph: boolean): ModeBadge {
  if (mode === "fixture") return { label: "Fixture data", tone: "amber" };
  return hasGraph ? { label: "Live", tone: "green" } : { label: "Live · connecting", tone: "red" };
}

export const LEAVE_FIXTURE_WARNING =
  "Switching reloads the page and drops the overrides made in fixture mode. Switch anyway?";
