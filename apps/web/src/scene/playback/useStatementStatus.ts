import { useSceneStore } from "../store";
import type { StatementStatus, StatementStatuses } from "./statementStatus";

export function useStatementStatus(segmentId: string | null | undefined): StatementStatus | null {
  return useSceneStore((state) => (segmentId ? (state.statements[segmentId] ?? null) : null));
}

export function useStatementStatuses(): StatementStatuses {
  return useSceneStore((state) => state.statements);
}

export function useLiveIdentity(): string | null {
  return useSceneStore((state) => state.liveIdentity);
}
