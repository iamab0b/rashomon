import type { Anchor, Event, EventGraph } from "@rashomon/schema";

const landmarksOf = (e: Event): string[] =>
  [e.from, e.to, e.at]
    .filter((a): a is Anchor => a !== undefined)
    .flatMap((a) => {
      if (a.kind === "at" || a.kind === "near" || a.kind === "behind")
        return [a.landmark];
      if (a.kind === "between") return [a.a, a.b];
      return [];
    });

export type Comparison = {
  matched: number;
  total: number;
  missing: string[];
  extras: string[];
};

export function compareToFixture(
  produced: EventGraph,
  expected: EventGraph,
): Comparison {
  const live = produced.events.filter((e) => e.status !== "superseded");
  const used = new Set<string>();
  const missing: string[] = [];
  let matched = 0;
  for (const want of expected.events) {
    const wantLms = landmarksOf(want);
    const hit = live.find((got) => {
      if (used.has(got.id)) return false;
      if (got.actor !== want.actor || got.action !== want.action) return false;
      if (wantLms.length === 0) return true;
      const gotLms = landmarksOf(got);
      return wantLms.some((l) => gotLms.includes(l));
    });
    if (hit) {
      used.add(hit.id);
      matched++;
    } else {
      missing.push(`${want.id} ${want.actor} ${want.action} ${wantLms.join(",")}`);
    }
  }
  const extras = live
    .filter((e) => !used.has(e.id))
    .map((e) => `${e.id} ${e.actor} ${e.action} ${landmarksOf(e).join(",")}`);
  return { matched, total: expected.events.length, missing, extras };
}
