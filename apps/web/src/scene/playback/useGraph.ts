import type { ResolvedEvent, ResolvedGraph } from "@rashomon/engine";
import type { EventGraph, Status } from "@rashomon/schema";
import { useEffect } from "react";
import type { LiveGraphSource } from "../live/liveGraphSource";
import { useSceneStore, type GraphErrors, type StatusMap } from "../store";
import type { GraphSource } from "./graphSource";
import { NO_STATEMENTS, type StatementStatuses } from "./statementStatus";

export type GraphView = {
  readonly resolved: ResolvedGraph | null;
  readonly statuses: StatusMap;
  readonly graph: EventGraph | null;
};

export function statusOf(statuses: StatusMap, event: Pick<ResolvedEvent, "id" | "status">): Status {
  return Object.hasOwn(statuses, event.id) ? (statuses[event.id] ?? event.status) : event.status;
}

const NO_ERRORS: GraphErrors = { connection: null, action: null };

function errorsOf(source: GraphSource): GraphErrors {
  if (source.kind !== "live") return NO_ERRORS;
  const live = source as Partial<Pick<LiveGraphSource, "error" | "actionError">>;
  return { connection: live.error ?? null, action: live.actionError ?? null };
}

export function pushSource(source: GraphSource): void {
  const state = useSceneStore.getState();
  state.setGraph(source.getSnapshot());
  state.setGraphErrors(errorsOf(source));
  const extra = source as Partial<{ identity: string | null; statementStatuses: () => StatementStatuses }>;
  state.setLiveIdentity(source.kind === "live" ? (extra.identity ?? null) : null);
  state.setStatements(extra.statementStatuses?.() ?? NO_STATEMENTS);
}

export function useGraphSource(source: GraphSource | null): void {
  const setGraph = useSceneStore((state) => state.setGraph);
  const setGraphSource = useSceneStore((state) => state.setGraphSource);
  const setGraphErrors = useSceneStore((state) => state.setGraphErrors);
  useEffect(() => {
    if (!source) return;
    const push = () => pushSource(source);
    push();
    const unsubscribe = source.subscribe(push);
    setGraphSource(source);
    return () => {
      unsubscribe();
      setGraphSource(null);
      setGraph({ resolved: null, statuses: {} });
      setGraphErrors(NO_ERRORS);
      useSceneStore.getState().setLiveIdentity(null);
      useSceneStore.getState().setStatements(NO_STATEMENTS);
    };
  }, [source, setGraph, setGraphSource, setGraphErrors]);
}

export function useGraphErrors(): { connectionError: string | null; actionError: string | null } {
  const connectionError = useSceneStore((state) => state.connectionError);
  const actionError = useSceneStore((state) => state.actionError);
  return { connectionError, actionError };
}

export function useGraph(): GraphView {
  const resolved = useSceneStore((state) => state.resolved);
  const statuses = useSceneStore((state) => state.statuses);
  const graph = useSceneStore((state) => state.graph);
  return { resolved, statuses, graph };
}
