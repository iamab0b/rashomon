import * as Scene from "../scene";
import { useGraphActions, type GraphActions } from "../scene";
import type { StatementStatus, SubmitStatement } from "./statement";

type UpcomingSceneExports = Partial<{
  useStatementStatus: (segmentId: string) => StatementStatus;
  useLiveIdentity: () => string | null;
}>;

const upcoming = Scene as unknown as UpcomingSceneExports;

const noStatus = (_segmentId: string): StatementStatus | null => null;
const noIdentity = (): string | null => null;

export const useStatementStatusOrNull: (segmentId: string) => StatementStatus | null = upcoming.useStatementStatus ?? noStatus;
export const useLiveIdentityOrNull: () => string | null = upcoming.useLiveIdentity ?? noIdentity;

export function useSubmitStatement(): SubmitStatement | null {
  const actions = useGraphActions() as GraphActions & Partial<{ submitStatement: SubmitStatement }>;
  return actions.submitStatement ?? null;
}
