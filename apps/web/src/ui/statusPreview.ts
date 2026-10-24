import type { ResolvedEvent, Status } from "../scene";

export const ALL_STATUSES: readonly Status[] = ["plausible", "proposed", "implausible", "overridden", "superseded"];

export function isStatusPreview(search: string): boolean {
  return new URLSearchParams(search).get("preview") === "statuses";
}

export function searchWithoutPreview(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("preview");
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function previewStatuses(
  events: readonly Pick<ResolvedEvent, "id" | "tStart">[],
  statusOf: (id: string) => Status,
): Record<string, Status> {
  const ordered = [...events].sort((a, b) => b.tStart - a.tStart);
  const current = new Map(ordered.map((event) => [event.id, statusOf(event.id)]));
  const changed: Record<string, Status> = {};

  for (const wanted of ALL_STATUSES) {
    if ([...current.values()].includes(wanted)) continue;
    const counts = new Map<Status, number>();
    for (const status of current.values()) counts.set(status, (counts.get(status) ?? 0) + 1);
    const donor = ordered.find((event) => (counts.get(current.get(event.id)!) ?? 0) > 1 && !changed[event.id]);
    if (!donor) break;
    current.set(donor.id, wanted);
    changed[donor.id] = wanted;
  }
  return changed;
}
