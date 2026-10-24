import type { SceneManifest } from "@rashomon/schema";
import type { FlagDraft, ResolvedGraph } from "../types";
import { actorLabel, nearestLandmarks } from "./labels";
import { actorPositionAt, endPoint, startPoint } from "./positions";

export function unanchoredFlags(resolved: ResolvedGraph, manifest: SceneManifest): FlagDraft[] {
  const flags: FlagDraft[] = [];
  for (const e of resolved.events) {
    if (e.status === "superseded") continue;
    const movement = e.action === "walk" || e.action === "run";
    const missing = movement
      ? (e.from ? 0 : 1) + (e.to ? 0 : 1)
      : startPoint(e) || endPoint(e)
        ? 0
        : 1;
    if (!missing) continue;
    const near = actorPositionAt(resolved.events, e.actor, e.tStart);
    const [first, second] = near ? nearestLandmarks(near, manifest, 2) : [];
    flags.push({
      eventId: e.id,
      check: "unanchored",
      severity: "soft",
      detail: movement
        ? `${e.id} (${e.action}) is missing ${missing} of its 2 anchors, so no route can be checked.`
        : `${e.id} (${e.action} by ${e.actor}) resolved to no position in the room, 0 of 1 anchors.`,
      evidence: { missingAnchors: missing },
      suggestedQuestion:
        first && second
          ? `Where in the room was that? Closer to the ${first.label} or the ${second.label}?`
          : "Where in the room was that?",
    });
  }
  return flags;
}

export function missingTimeFlags(resolved: ResolvedGraph): FlagDraft[] {
  const flags: FlagDraft[] = [];
  const live = resolved.events.filter((o) => o.status !== "superseded");
  live.forEach((e, i) => {
    if (!e.tInferred) return;
    const sameActor = live.filter((o) => o !== e && o.actor === e.actor);
    const neighbor =
      sameActor.filter((o) => live.indexOf(o) < i).pop() ??
      sameActor[0] ??
      live[i - 1] ??
      live[i + 1];
    flags.push({
      eventId: e.id,
      check: "missing_time",
      severity: "soft",
      detail: `${e.id} has no stated time; ${e.tStart.toFixed(1)}-${e.tEnd.toFixed(1)} s (${(e.tEnd - e.tStart).toFixed(1)} s) was inferred from the action.`,
      evidence: {
        inferredStartS: e.tStart,
        inferredEndS: e.tEnd,
        durationS: Number((e.tEnd - e.tStart).toFixed(2)),
      },
      suggestedQuestion: neighbor
        ? `Was that before or after the ${neighbor.action} by ${actorLabel(resolved, neighbor.actor)}?`
        : "When did that happen?",
    });
  });
  return flags;
}
