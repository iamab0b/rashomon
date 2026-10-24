import { useGraph } from "../scene";
import { LEAVE_FIXTURE_WARNING, parseMode, searchWithMode, type GraphMode } from "./graphMode";

export function useGraphMode(): [GraphMode, (mode: GraphMode) => void] {
  const { resolved } = useGraph();
  const mode = parseMode(window.location.search);
  const setMode = (next: GraphMode) => {
    if (next === mode) return;
    const hasOverrides = mode === "fixture" && resolved?.events.some((event) => event.override);
    if (hasOverrides && !window.confirm(LEAVE_FIXTURE_WARNING)) return;
    window.location.search = searchWithMode(window.location.search, next);
  };
  return [mode, setMode];
}
