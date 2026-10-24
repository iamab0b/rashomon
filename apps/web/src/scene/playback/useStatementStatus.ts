import { useSceneStore } from "../store";
import type { StatementStatus } from "./statementStatus";

const EXTRACTING: StatementStatus = { state: "extracting" };

export function useStatementStatus(segmentId: string | null | undefined): StatementStatus | null {
  return useSceneStore((state) => (segmentId ? (state.statements[segmentId] ?? EXTRACTING) : null));
}

export function useLiveIdentity(): string | null {
  return useSceneStore((state) => state.liveIdentity);
}
