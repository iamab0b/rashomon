import type { ResolvedEvent, Vec3 } from "../types";

export const startPoint = (e: ResolvedEvent): Vec3 | undefined =>
  e.from ?? e.path[0] ?? e.at;

export const endPoint = (e: ResolvedEvent): Vec3 | undefined =>
  e.to ?? e.path[e.path.length - 1] ?? e.at;

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
  return frac(e, t) < 0.5 ? startPoint(e) : endPoint(e);
}

const frac = (e: ResolvedEvent, t: number): number =>
  e.tEnd > e.tStart ? (t - e.tStart) / (e.tEnd - e.tStart) : 0;

export function actorPositionAt(
  events: ResolvedEvent[],
  actor: string,
  t: number,
): Vec3 | undefined {
  const mine = events.filter((e) => e.actor === actor && e.status !== "superseded");
  const covering = mine.filter((e) => e.tStart <= t && t <= e.tEnd);
  for (let i = covering.length - 1; i >= 0; i--) {
    const p = eventPositionAt(covering[i]!, t);
    if (p) return p;
  }
  const before = mine
    .filter((e) => e.tEnd < t && endPoint(e))
    .sort((a, b) => b.tEnd - a.tEnd)[0];
  if (before) return endPoint(before);
  const after = mine
    .filter((e) => e.tStart > t && startPoint(e))
    .sort((a, b) => a.tStart - b.tStart)[0];
  return after ? startPoint(after) : undefined;
}
