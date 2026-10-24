import { useSceneStore } from "../store";
import type { StatementStatus } from "./statementStatus";

export function useStatementStatus(segmentId: string | null | undefined): StatementStatus | null {
  return useSceneStore((state) => (segmentId ? (state.statements[segmentId] ?? null) : null));
}

export function useLiveIdentity(): string | null {
  return useSceneStore((state) => state.liveIdentity);
}
