import * as React from "react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { StatementSection, StatementSectionView, type StatementSectionViewProps } from "./StatementSection";
import { gatedRobbery } from "./testGraph";

type Dispatcher = { H: unknown };
const internals = () =>
  (React as unknown as Record<string, Dispatcher>).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE as Dispatcher;

function renderOnce<T>(render: () => T): { result: T; effects: Array<() => unknown> } {
  const effects: Array<() => unknown> = [];
  const host = internals();
  const previous = host.H;
  host.H = {
    useRef: <V,>(initial: V) => ({ current: initial }),
    useMemo: <V,>(factory: () => V) => factory(),
    useCallback: <V,>(callback: V) => callback,
    useState: <V,>(initial: V | (() => V)) => [typeof initial === "function" ? (initial as () => V)() : initial, () => undefined],
    useReducer: <V,>(_reducer: unknown, initial: V) => [initial, () => undefined],
    useEffect: (effect: () => unknown) => void effects.push(effect),
    useLayoutEffect: (effect: () => unknown) => void effects.push(effect),
    useSyncExternalStore: <V,>(_subscribe: unknown, getSnapshot: () => V) => getSnapshot(),
    useContext: (context: { _currentValue: unknown }) => context._currentValue,
    useId: () => "id",
    useDebugValue: () => undefined,
  };
  try {
    return { result: render(), effects };
  } finally {
    host.H = previous;
  }
}

function handlersIn(node: ReactNode, found: Array<(event: unknown) => unknown> = []): Array<(event: unknown) => unknown> {
  if (Array.isArray(node)) {
    for (const child of node) handlersIn(child, found);
    return found;
  }
  if (typeof node !== "object" || node === null || !("props" in node)) return found;
  const props = (node as ReactElement<Record<string, unknown>>).props;
  for (const [name, value] of Object.entries(props)) if (/^on[A-Z]/.test(name) && typeof value === "function") found.push(value as (event: unknown) => unknown);
  return handlersIn(props.children as ReactNode, found);
}

const fakeEvent = () => ({
  key: "Enter",
  ctrlKey: true,
  metaKey: true,
  currentTarget: { value: "He ran out the door." },
  target: { value: "He ran out the door." },
  preventDefault: () => {},
  stopPropagation: () => {},
});

const fetchSpy = vi.fn(async (_url: unknown, _init?: unknown) => new Response(JSON.stringify({ token: "never" })));
const getUserMedia = vi.fn(async () => {
  throw new Error("microphone must not be requested");
});

beforeEach(() => {
  fetchSpy.mockClear();
  getUserMedia.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("window", { location: { search: "?fixture=store" }, setTimeout, clearTimeout });
  vi.stubGlobal("__CARTESIA_AGENT_ID__", "agent_gate_test");
});

afterEach(() => vi.unstubAllGlobals());

test("without ?voice=1 the real StatementSection never fetches a token or asks for the microphone, even after interaction", async () => {
  const { result: section, effects } = renderOnce(() => StatementSection({ graph: gatedRobbery(), onSelect: () => {} }) as ReactElement<StatementSectionViewProps>);
  expect(section.type).toBe(StatementSectionView);
  for (const effect of effects) effect();
  const { result: tree } = renderOnce(() => StatementSectionView(section.props));
  const handlers = handlersIn(tree);
  expect(handlers.length).toBeGreaterThan(0);
  for (const handler of handlers) {
    try {
      handler(fakeEvent());
    } catch {}
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(fetchSpy.mock.calls.filter(([url]) => String(url).includes("/token"))).toHaveLength(0);
  expect(fetchSpy).not.toHaveBeenCalled();
});
