import type { ResolvedEvent } from "@rashomon/engine";
import type { Status } from "@rashomon/schema";
import { useEffect } from "react";
import { useSceneStore, type GraphSnapshot, type StatusMap } from "../store";
import type { GraphSource } from "./graphSource";

export type GraphView = GraphSnapshot;

export function statusOf(statuses: StatusMap, event: Pick<ResolvedEvent, "id" | "status">): Status {
  return Object.hasOwn(statuses, event.id) ? (statuses[event.id] ?? event.status) : event.status;
}

export function useGraphSource(source: GraphSource | null): void {
  const setGraph = useSceneStore((state) => state.setGraph);
  useEffect(() => {
    if (!source) return;
    const push = () => setGraph(source.getSnapshot());
    push();
    const unsubscribe = source.subscribe(push);
    return () => {
      unsubscribe();
      setGraph({ resolved: null, statuses: {} });
    };
  }, [source, setGraph]);
}

export function useGraph(): GraphView {
  const resolved = useSceneStore((state) => state.resolved);
  const statuses = useSceneStore((state) => state.statuses);
  return { resolved, statuses };
}
