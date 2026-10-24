import type { Override } from "@rashomon/schema";

export const MIN_REASON_LENGTH = 10;

export function reasonLength(reason: string): number {
  return reason.trim().length;
}

export function canConfirm(reason: string): boolean {
  return reasonLength(reason) >= MIN_REASON_LENGTH;
}

export function buildOverride(by: string, reason: string, flagIds: string[], at: number): Override {
  if (!canConfirm(reason)) throw new Error(`override reason needs at least ${MIN_REASON_LENGTH} characters`);
  return { by, reason: reason.trim(), at, flagIds };
}
