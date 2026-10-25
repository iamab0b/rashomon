import * as React from "react";
import type { ReactElement, ReactNode } from "react";

type Internals = { H: unknown };

const internals = (): Internals =>
  (React as unknown as Record<string, Internals>).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE as Internals;

const hostHooks = {
  useRef: <T,>(initial: T) => ({ current: initial }),
  useMemo: <T,>(factory: () => T) => factory(),
  useCallback: <T,>(callback: T) => callback,
  useState: <T,>(initial: T | (() => T)) => [typeof initial === "function" ? (initial as () => T)() : initial, () => undefined],
  useEffect: () => undefined,
  useLayoutEffect: () => undefined,
  useSyncExternalStore: <T,>(_subscribe: unknown, getSnapshot: () => T) => getSnapshot(),
  useDebugValue: () => undefined,
};

export function callHook<T>(use: () => T): T {
  const host = internals();
  const previous = host.H;
  host.H = hostHooks;
  try {
    return use();
  } finally {
    host.H = previous;
  }
}

type Cleanup = void | (() => void);

export function callHookWithEffects<T>(use: () => T): { result: T; cleanup: () => void } {
  const effects: Array<() => Cleanup> = [];
  const host = internals();
  const previous = host.H;
  host.H = {
    ...hostHooks,
    useEffect: (effect: () => Cleanup) => void effects.push(effect),
    useLayoutEffect: (effect: () => Cleanup) => void effects.push(effect),
  };
  let result: T;
  try {
    result = use();
  } finally {
    host.H = previous;
  }
  const cleanups = effects.map((effect) => effect());
  return {
    result,
    cleanup: () => {
      for (const cleanup of cleanups) if (typeof cleanup === "function") cleanup();
    },
  };
}

export function findElement(node: ReactNode, matches: (props: Record<string, unknown>) => boolean): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, matches);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object" || node === null || !("props" in node)) return null;
  const element = node as ReactElement<Record<string, unknown>>;
  if (matches(element.props)) return element;
  return findElement(element.props.children as ReactNode, matches);
}
