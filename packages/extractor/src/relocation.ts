import type { Anchor, Event, Patch, Segment } from "@rashomon/schema";
import { speakerOf } from "./prompt";
import { CONFIDENCE_MAP } from "./tools";
import type { ExtractContext } from "./types";

export const RELOCATION_WALK_SPEED_MS = 1.2;
export const RELOCATION_MIN_WALK_S = 2;

const FIRST_PERSON_MOVE =
  /\bI(?:'d|’d| had| then| just)?\s+(?:came|come|went|go|walked|walk|moved|move|stepped|step|ran|run|headed|head|wandered|got up)\b/i;

const MOVEMENTS = new Set(["walk", "run"]);

type Update = Extract<Patch, { op: "update_event" }>;

const placeOf = (a: Anchor | undefined): string | undefined =>
  a && (a.kind === "at" || a.kind === "near" || a.kind === "behind") ? a.landmark : undefined;

const startOf = (e: Event, u?: Update): number => (u?.changes.t ?? e.t)[0];
const endOf = (e: Event, u?: Update): number => (u?.changes.t ?? e.t)[1];

const walkSeconds = (from: string, to: string, ctx: ExtractContext): number => {
  const a = ctx.landmarks.find((l) => l.id === from)?.position;
  const b = ctx.landmarks.find((l) => l.id === to)?.position;
  if (!a || !b) return RELOCATION_MIN_WALK_S + 1;
  const meters = Math.hypot(a[0] - b[0], a[2] - b[2]);
  return Math.max(RELOCATION_MIN_WALK_S, Math.ceil(meters / RELOCATION_WALK_SPEED_MS));
};

const ownActor = (actor: string, segment: Segment, ctx: ExtractContext): boolean => {
  const speaker = speakerOf(segment, ctx).actorId;
  if (speaker !== undefined) return actor === speaker;
  return ctx.actors.find((a) => a.id === actor)?.role === "witness";
};

export function completeRelocation(
  patches: Patch[],
  segment: Segment,
  ctx: ExtractContext,
): { patches: Patch[]; notes: string[] } {
  if (!FIRST_PERSON_MOVE.test(segment.text)) return { patches, notes: [] };
  const live = ctx.events.filter((e) => e.status !== "superseded");
  const updates = new Map<string, Update>();
  for (const p of patches) if (p.op === "update_event") updates.set(p.id, p);

  const moved = live
    .flatMap((e) => {
      const u = updates.get(e.id);
      const from = placeOf(e.at);
      const to = u?.changes.at;
      return u && to && from && placeOf(to) && placeOf(to) !== from && ownActor(e.actor, segment, ctx)
        ? [{ event: e, update: u, from, to }]
        : [];
    })
    .sort((a, b) => startOf(a.event, a.update) - startOf(b.event, b.update));
  const first = moved[0];
  if (!first) return { patches, notes: [] };

  const { event: relocated, from, to } = first;
  const actor = relocated.actor;
  const arrive = startOf(relocated, first.update);
  const sources = [segment.id];
  const out = [...patches];
  const notes: string[] = [];

  const earlier = live
    .filter((e) => e.actor === actor && e.id !== relocated.id && !updates.get(e.id)?.changes.at)
    .filter((e) => placeOf(e.at) === from && e.t[0] < arrive)
    .sort((a, b) => a.t[0] - b.t[0])
    .at(-1);

  const addedWalk = patches.find(
    (p): p is Extract<Patch, { op: "add_event" }> =>
      p.op === "add_event" && p.event.actor === actor && MOVEMENTS.has(p.event.action) && placeOf(p.event.to) === placeOf(to),
  );
  const existingWalk = live.find(
    (e) => e.actor === actor && MOVEMENTS.has(e.action) && placeOf(e.to) === placeOf(to) && e.t[1] <= endOf(relocated, first.update),
  );

  let walkStart: number;
  if (addedWalk) walkStart = addedWalk.event.t[0];
  else if (existingWalk) walkStart = existingWalk.t[0];
  else {
    const floor = earlier ? earlier.t[0] + (arrive - earlier.t[0]) / 2 : 0;
    walkStart = Math.max(floor, arrive - walkSeconds(from, placeOf(to)!, ctx), 0);
    out.push({
      op: "add_event",
      event: {
        witnessId: segment.witnessId,
        actor,
        action: "walk",
        from: { kind: "at", landmark: from },
        to,
        t: [walkStart, Math.max(arrive, walkStart)],
        tConfidence: "inferred",
        confidence: CONFIDENCE_MAP.medium,
        sources,
      },
    });
    notes.push(`added ${actor}'s walk from ${from} to ${placeOf(to)}, t=[${walkStart}, ${arrive}]`);
  }

  const u = earlier && updates.get(earlier.id);
  if (earlier && !u?.changes.t && earlier.t[1] > walkStart) {
    const t: [number, number] = [earlier.t[0], walkStart];
    if (u) out[out.indexOf(u)] = { ...u, changes: { ...u.changes, t } };
    else out.push({ op: "update_event", id: earlier.id, changes: { t }, sources });
    notes.push(`ended ${earlier.id} at ${walkStart}, where the walk starts`);
  }

  const later = live
    .filter((e) => e.actor === actor && e.id !== relocated.id && e.t[0] >= arrive)
    .sort((a, b) => a.t[0] - b.t[0]);
  for (const e of later) {
    if (MOVEMENTS.has(e.action) || e.from || e.to) break;
    if (placeOf(e.at) !== from || updates.get(e.id)?.changes.at) continue;
    const u = updates.get(e.id);
    if (u) out[out.indexOf(u)] = { ...u, changes: { ...u.changes, at: to } };
    else out.push({ op: "update_event", id: e.id, changes: { at: to }, sources });
    notes.push(`moved ${e.id} to ${placeOf(to)}, carried forward from ${relocated.id}`);
  }

  return { patches: out, notes };
}
