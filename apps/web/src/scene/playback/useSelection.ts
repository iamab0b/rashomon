import { useSceneStore } from "../store";

export type SelectionApi = {
  selectedEventId: string | null;
  select: (id: string) => void;
  clear: () => void;
};

export function useSelection(): SelectionApi {
  const selectedEventId = useSceneStore((state) => state.selectedEventId);
  const select = useSceneStore((state) => state.select);
  const clear = useSceneStore((state) => state.clear);
  return { selectedEventId, select, clear };
}
