import type { ResolvedEvent, Vec3 } from "../types";

const isMovement = (e: ResolvedEvent): boolean => e.action === "walk" || e.action === "run";

export const startPoint = (e: ResolvedEvent): Vec3 | undefined =>
  isMovement(e) ? e.from : (e.at ?? e.from);

export const endPoint = (e: ResolvedEvent): Vec3 | undefined => {
  if (!isMovement(e)) return e.at ?? e.to;
  return e.reachable ? e.to : undefined;
};

export const dist = (a: Vec3, b: Vec3): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function eventPositionAt(e: ResolvedEvent, t: number): Vec3 | undefined {
  const span = e.tEnd - e.tStart;
  if (e.path.length >= 2 && span > 0) {
    const frac = Math.min(Math.max((t - e.tStart) / span, 0), 1);
    let total = 0;
    for (let i = 1; i < e.path.length; i++) total += dist(e.path[i - 1]!, e.path[i]!);
    let target = frac * total;
    for (let i = 1; i < e.path.length; i++) {
      const a = e.path[i - 1]!;
      const b = e.path[i]!;
      const seg = dist(a, b);
      if (target <= seg || i === e.path.length - 1) {
        const f = seg > 0 ? Math.min(target / seg, 1) : 0;
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      }
      target -= seg;
    }
  }
  if (!isMovement(e)) return e.at ?? startPoint(e);
  if (t <= e.tStart) return startPoint(e);
  if (t >= e.tEnd) return endPoint(e);
  return undefined;
}

export function movementCover(
  events: ResolvedEvent[],
  actor: string,
  t: number,
): { position: Vec3 | undefined } | undefined {
  const moving = events.filter(
    (e) => e.actor === actor && e.status !== "superseded" && isMovement(e) && e.tStart <= t && t <= e.tEnd,
  );
  if (moving.length === 0) return undefined;
  for (let i = moving.length - 1; i >= 0; i--) {
    const p = eventPositionAt(moving[i]!, t);
    if (p) return { position: p };
  }
  return { position: undefined };
}

export function actorPositionAt(
  events: ResolvedEvent[],
  actor: string,
  t: number,
): Vec3 | undefined {
  const cover = movementCover(events, actor, t);
  if (cover) return cover.position;
  const mine = events.filter((e) => e.actor === actor && e.status !== "superseded");
  const covering = mine.filter((e) => e.tStart <= t && t <= e.tEnd);
  if (covering.length > 0) {
    for (let i = covering.length - 1; i >= 0; i--) {
      const p = eventPositionAt(covering[i]!, t);
      if (p) return p;
    }
    return undefined;
  }
  let latest: ResolvedEvent | undefined;
  for (const e of mine) if (e.tEnd < t && (!latest || e.tEnd >= latest.tEnd)) latest = e;
  return latest ? endPoint(latest) : undefined;
}
