import { useMemo } from "react";
import { useSceneStore } from "../store";
import { witnessLayers, type WitnessLayer } from "./witnessLayers";

export type WitnessLayersApi = {
  readonly witnesses: readonly WitnessLayer[];
  readonly hidden: ReadonlySet<string>;
  toggle(id: string): void;
  only(id: string): void;
  showAll(): void;
};

export function useWitnessLayers(): WitnessLayersApi {
  const graph = useSceneStore((state) => state.graph);
  const resolved = useSceneStore((state) => state.resolved);
  const hidden = useSceneStore((state) => state.hiddenWitnesses);
  const witnesses = useMemo(() => witnessLayers(graph, resolved), [graph, resolved]);
  return useMemo(
    () => ({
      witnesses,
      hidden,
      toggle: (id) => useSceneStore.getState().toggleWitness(id),
      only: (id) =>
        useSceneStore.getState().onlyWitness(
          id,
          witnesses.map((w) => w.id),
        ),
      showAll: () => useSceneStore.getState().showAllWitnesses(),
    }),
    [witnesses, hidden],
  );
}
