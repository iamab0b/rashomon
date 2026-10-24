import { useSyncExternalStore } from "react";
import { parseMode, searchWithMode, type GraphMode } from "./graphMode";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

const getMode = () => parseMode(window.location.search);

export function setGraphMode(next: GraphMode) {
  const { pathname, search, hash } = window.location;
  window.history.replaceState(window.history.state, "", `${pathname}${searchWithMode(search, next)}${hash}`);
  listeners.forEach((listener) => listener());
}

export function useGraphMode(): [GraphMode, (mode: GraphMode) => void] {
  return [useSyncExternalStore(subscribe, getMode), setGraphMode];
}
