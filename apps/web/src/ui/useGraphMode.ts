import { parseMode, searchWithMode, type GraphMode } from "./graphMode";

export function useGraphMode(): [GraphMode, (mode: GraphMode) => void] {
  const mode = parseMode(window.location.search);
  const setMode = (next: GraphMode) => {
    if (next === mode) return;
    window.location.search = searchWithMode(window.location.search, next);
  };
  return [mode, setMode];
}
