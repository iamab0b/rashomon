import type { Flag, ResolvedEvent, ResolvedGraph } from "../scene";
import { eventCoordinates, placeName } from "./places";
import { actorLabel, eventTime } from "./shared";

export type EvidenceRow = { label: string; value: string; raw?: boolean };

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const num = (value: unknown, digits = 1): string | null => (typeof value === "number" ? value.toFixed(digits) : null);

function activeEvent(graph: ResolvedGraph, actor: string, t: number): ResolvedEvent | undefined {
  return graph.events.find((event) => event.actor === actor && event.status !== "superseded" && event.tStart <= t && t <= event.tEnd);
}

export function flagEvidenceRows(
  graph: ResolvedGraph,
  event: ResolvedEvent,
  flag: Flag,
  placeOf: (event: ResolvedEvent) => string | null,
): EvidenceRow[] {
  const rows: EvidenceRow[] = [];
  const add = (label: string, value: string | null, raw = false) => {
    if (value) rows.push(raw ? { label, value: upper(value), raw } : { label, value: upper(value) });
  };
  const here = placeOf(event);
  const coords = here ? null : eventCoordinates(event);
  const { evidence } = flag;
  switch (flag.check) {
    case "sightline": {
      const t = typeof evidence.atTimeS === "number" ? evidence.atTimeS : event.tStart;
      const target = event.target ? activeEvent(graph, event.target, t) : undefined;
      const targetName = event.target ? actorLabel(graph, event.target).toLowerCase() : null;
      const thereName = target ? placeOf(target) : null;
      const there = thereName ?? (target ? eventCoordinates(target) : null);
      const from = here ? here.replace(/^From /i, "") : coords;
      if (from) {
        const to = there && targetName ? ` to the ${targetName} ${lower(there)}` : "";
        add("Sightline", `From ${lower(from)}${to}`, !here || (there !== null && !thereName));
      }
      if (typeof evidence.blocker === "string") add("Blocked by", placeName(graph.sceneId, evidence.blocker));
      const along = num(evidence.blockerDistanceM);
      const length = num(evidence.rayLengthM);
      if (along && length) add("Where", `${along} m along a ${length} m line of sight`);
      add("When", num(evidence.atTimeS) ? `${num(evidence.atTimeS)} s` : null);
      break;
    }
    case "reachability": {
      add("Route", here ?? coords, !here);
      if (typeof evidence.blocker === "string") add("Blocked by", placeName(graph.sceneId, evidence.blocker));
      add("Straight-line distance", num(evidence.distanceM) ? `${num(evidence.distanceM)} m` : null);
      break;
    }
    case "time_distance": {
      add("Movement", here ?? coords, !here);
      const distance = num(evidence.distanceM);
      const duration = num(evidence.durationS);
      if (distance && duration) add("Distance", `${distance} m in ${duration} s`);
      const speed = num(evidence.speedMS);
      const limit = num(evidence.limitMS);
      if (speed && limit) add("Speed", `${speed} m/s, limit ${limit} m/s`);
      break;
    }
    case "contradiction": {
      add("Place", here ?? coords, !here);
      add("When", num(evidence.atTimeS) ? `${num(evidence.atTimeS)} s` : null);
      add("Apart", num(evidence.distanceM) ? `${num(evidence.distanceM)} m` : null);
      break;
    }
    case "unanchored":
      add("Place", here ?? "Not recorded");
      break;
    case "missing_time":
      add("Time", `${eventTime(event)}, estimated`);
      add("Place", here ?? coords, !here);
      break;
  }
  return rows;
}
