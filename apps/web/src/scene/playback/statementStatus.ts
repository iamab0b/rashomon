export type StatementStatus = {
  readonly state: "extracting" | "done" | "failed";
  readonly patchCount?: number;
  readonly error?: string;
  readonly note?: string;
};

export type StatementStatuses = Readonly<Record<string, StatementStatus>>;

export type SubmittedStatement = { readonly segmentId: string; readonly baseVersion: number };

export type LiveSegmentRow = {
  readonly id: string;
  readonly extractedAt?: unknown;
  readonly extractPatchCount?: number;
  readonly extractError?: string;
};

export const NO_STATEMENTS: StatementStatuses = {};

export function liveStatementStatus(
  row: LiveSegmentRow | undefined,
  baseVersion: number,
  graphVersion: number,
): StatementStatus {
  if (row) {
    if (row.extractedAt !== undefined) {
      return {
        state: "done",
        patchCount: row.extractPatchCount ?? 0,
        ...(row.extractError !== undefined ? { error: row.extractError } : {}),
      };
    }
    if (row.extractError !== undefined) return { state: "failed", error: row.extractError };
    return { state: "extracting" };
  }
  return graphVersion > baseVersion ? { state: "done" } : { state: "extracting" };
}
