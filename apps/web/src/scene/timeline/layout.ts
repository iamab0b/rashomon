import type { ResolvedGraph, Status } from "../index";

export const W = 1000;
export const LABEL_W = 120;
export const ROW_H = 34;
export const TOP = 22;
export const TRACK_W = W - LABEL_W - 10;

export type Block = {
  key: string;
  id: string | null;
  tStart: number;
  tEnd: number;
  status?: Status;
  color: string;
  label: string;
};

export type Row = { id: string; label: string; blocks: Block[]; hidden: number };

export type StatusMap = Readonly<Record<string, Status>>;

const PALETTE: Record<string, string> = { witness: "#4f9dff", suspect: "#ff9f43", clerk: "#4cd6a0" };
const FALLBACK = ["#c58bff", "#f06fb5", "#9ad14b", "#e6d84f"];
const PROP_COLOR = "#8a94a6";

export function actorColor(actorId: string, role: string, index: number): string {
  return PALETTE[role] ?? PALETTE[actorId] ?? FALLBACK[index % FALLBACK.length] ?? PROP_COLOR;
}

export function buildRows(resolved: ResolvedGraph | null, statuses: StatusMap): Row[] {
  if (!resolved) return [];
  const rows: Row[] = resolved.actors.map((actor, index) => {
    const color = actorColor(actor.id, actor.role, index);
    const mine = resolved.events.filter((event) => event.actor === actor.id);
    const status = (id: string, fallback: Status) => statuses[id] ?? fallback;
    const shown = mine.filter((event) => status(event.id, event.status) !== "superseded");
    return {
      id: actor.id,
      label: actor.label,
      hidden: mine.length - shown.length,
      blocks: shown.map((event) => ({
        key: event.id,
        id: event.id,
        tStart: event.tStart,
        tEnd: event.tEnd,
        status: status(event.id, event.status),
        color,
        label: event.id,
      })),
    };
  });
  const propBlocks = resolved.props.flatMap((prop) =>
    (prop.heldByIntervals ?? []).map((interval, i) => ({
      key: `${prop.id}:${i}`,
      id: null,
      tStart: interval.tStart,
      tEnd: interval.tEnd,
      color: PROP_COLOR,
      label: `${prop.id}`,
    })),
  );
  return [...rows, { id: "props", label: "props", blocks: propBlocks, hidden: 0 }];
}

export function xOf(t: number, duration: number): number {
  return LABEL_W + (duration > 0 ? (Math.min(Math.max(t, 0), duration) / duration) * TRACK_W : 0);
}

export function tOfX(x: number, duration: number): number {
  return Math.min(Math.max(((x - LABEL_W) / TRACK_W) * duration, 0), duration);
}

export function implausibleStarts(resolved: ResolvedGraph | null, statuses: StatusMap): { id: string; tStart: number }[] {
  if (!resolved) return [];
  return resolved.events
    .filter((event) => (statuses[event.id] ?? event.status) === "implausible")
    .map((event) => ({ id: event.id, tStart: event.tStart }))
    .sort((a, b) => a.tStart - b.tStart);
}

export function neighborFlag(
  list: { id: string; tStart: number }[],
  t: number,
  dir: 1 | -1,
): { id: string; tStart: number } | null {
  const eps = 1e-6;
  const pool = dir === 1 ? list.filter((e) => e.tStart > t + eps) : list.filter((e) => e.tStart < t - eps).reverse();
  return pool[0] ?? null;
}

export function nudgeDelta(key: string, shift: boolean): number | null {
  if (key === "ArrowLeft") return shift ? -0.1 : -0.5;
  if (key === "ArrowRight") return shift ? 0.1 : 0.5;
  return null;
}

export function strokeFor(status?: Status): { dash?: string; stroke: string; opacity: number } {
  if (status === undefined) return { stroke: PROP_COLOR, opacity: 1 };
  if (status === "proposed") return { dash: "5 3", stroke: "#ffffff", opacity: 0.4 };
  if (status === "implausible") return { dash: "5 3", stroke: "#ff4d4f", opacity: 1 };
  if (status === "overridden") return { stroke: "#ffffff", opacity: 1 };
  return { stroke: "#ffffff", opacity: 1 };
}
