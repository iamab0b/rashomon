import type { SceneManifest } from "@rashomon/schema";
import type { FlagDraft, ResolvedEvent, ResolvedGraph } from "../types";
import { nearestLabel, spokenActor } from "./labels";
import { dist, eventPositionAt } from "./positions";

export const CONTRADICTION_DISTANCE_M = 2;

const EDITOR_SOURCE_PREFIX = "investigator:";

const sharesSource = (a: ResolvedEvent, b: ResolvedEvent): boolean =>
  a.sources.some((s) => !s.startsWith(EDITOR_SOURCE_PREFIX) && b.sources.includes(s));

export function contradictionFlags(resolved: ResolvedGraph, manifest: SceneManifest): FlagDraft[] {
  const flags: FlagDraft[] = [];
  const live = resolved.events.filter((e) => e.status !== "superseded");
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      if (a.actor !== b.actor || sharesSource(a, b)) continue;
      const lo = Math.max(a.tStart, b.tStart);
      const hi = Math.min(a.tEnd, b.tEnd);
      if (hi - lo <= 0) continue;
      const t = (lo + hi) / 2;
      const pa = eventPositionAt(a, t);
      const pb = eventPositionAt(b, t);
      if (!pa || !pb) continue;
      const d = dist(pa, pb);
      if (d <= CONTRADICTION_DISTANCE_M) continue;
      const la = nearestLabel(pa, manifest);
      const lb = nearestLabel(pb, manifest);
      const who = spokenActor(resolved, a.actor);
      const said = who === "you" ? "you were" : `${who} was`;
      const detail = `${a.actor} is placed by the ${la} (${a.id}) and by the ${lb} (${b.id}), ${d.toFixed(1)} m apart, at t=${t.toFixed(1)}s.`;
      const evidence = { distanceM: Number(d.toFixed(2)), atTimeS: Number(t.toFixed(2)) };
      flags.push(
        {
          eventId: a.id,
          check: "contradiction",
          severity: "soft",
          detail,
          evidence,
          conflictsWith: [b.id],
          suggestedQuestion: `Earlier you said ${said} by the ${la} around then; now the ${lb}. Which came first?`,
        },
        {
          eventId: b.id,
          check: "contradiction",
          severity: "soft",
          detail,
          evidence,
          conflictsWith: [a.id],
          suggestedQuestion: `Earlier you said ${said} by the ${lb} around then; now the ${la}. Which came first?`,
        },
      );
    }
  }
  return flags;
}
