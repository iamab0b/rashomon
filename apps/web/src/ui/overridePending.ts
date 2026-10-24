import type { ResolvedEvent, Status } from "../scene";

export type PendingOverrides = Record<string, string>;

export type EventDisplay = { status: Status; pendingNote: string | null };

export function eventDisplay(
  event: Pick<ResolvedEvent, "id" | "status" | "override">,
  statuses: Record<string, Status | undefined>,
  pending: PendingOverrides,
): EventDisplay {
  const status = statuses[event.id] ?? event.status;
  const reason = status === "overridden" || event.override ? undefined : pending[event.id];
  return { status, pendingNote: reason ? `Override pending: ${reason}` : null };
}
