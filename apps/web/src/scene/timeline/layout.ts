import type { ResolvedGraph } from "@rashomon/engine";
import type { Status } from "@rashomon/schema";
import { statusOf } from "../playback/useGraph";

export const W = 1000;
export const LABEL_W = 120;
export const ROW_H = 34;
export const TOP = 22;
export const TRACK_W = W - LABEL_W - 10;
export const LANE_H = ROW_H - 8;

export type Block = {
  key: string;
  id: string | null;
  tStart: number;
  tEnd: number;
  status?: Status;
  color: string;
  label: string;
  lane: number;
};

export type Row = { id: string; label: string; blocks: Block[]; hidden: number; lanes: number };

export type StatusMap = Readonly<Record<string, Status>>;

const PALETTE: Record<string, string> = { witness: "#4f9dff", suspect: "#ff9f43", clerk: "#4cd6a0" };
const FALLBACK = ["#c58bff", "#f06fb5", "#9ad14b", "#e6d84f"];
const PROP_COLOR = "#8a94a6";
const QUIET_STROKE = "#4a5568";
const ACTOR_STROKE_OPACITY = 0.55;
const ACTIVE_STROKE_OPACITY = 0.9;

export function actorColor(actorId: string, role: string, index: number): string {
  return PALETTE[role] ?? PALETTE[actorId] ?? FALLBACK[index % FALLBACK.length] ?? PROP_COLOR;
}

function byStartEndId(a: Pick<Block, "key" | "id" | "tStart" | "tEnd">, b: Pick<Block, "key" | "id" | "tStart" | "tEnd">): number {
  const ka = a.id ?? a.key;
  const kb = b.id ?? b.key;
  return a.tStart - b.tStart || a.tEnd - b.tEnd || (ka < kb ? -1 : ka > kb ? 1 : 0);
}

export function assignLanes(blocks: Omit<Block, "lane">[]): { blocks: Block[]; lanes: number } {
  const laneEnds: number[] = [];
  const laneOf = new Map<string, number>();
  for (const block of [...blocks].sort(byStartEndId)) {
    let lane = laneEnds.findIndex((end) => end <= block.tStart);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = block.tEnd;
    laneOf.set(block.key, lane);
  }
  return {
    blocks: blocks.map((block) => ({ ...block, lane: laneOf.get(block.key) ?? 0 })),
    lanes: Math.max(laneEnds.length, 1),
  };
}

export function rowHeight(row: Row): number {
  return ROW_H + (row.lanes - 1) * LANE_H;
}

export function rowTops(rows: Row[]): number[] {
  let y = TOP;
  return rows.map((row) => {
    const top = y;
    y += rowHeight(row);
    return top;
  });
}

export function buildRows(resolved: ResolvedGraph | null, statuses: StatusMap): Row[] {
  if (!resolved) return [];
  const rows: Row[] = resolved.actors.map((actor, index) => {
    const color = actorColor(actor.id, actor.role, index);
    const mine = resolved.events.filter((event) => event.actor === actor.id);
    const shown = mine.filter((event) => statusOf(statuses, event) !== "superseded");
    const longestFirst = shown
      .map((event, order) => ({ event, order }))
      .sort((a, b) => b.event.tEnd - b.event.tStart - (a.event.tEnd - a.event.tStart) || a.order - b.order)
      .map(({ event }) => event);
    return {
      id: actor.id,
      label: actor.label,
      hidden: mine.length - shown.length,
      ...assignLanes(
        longestFirst.map((event) => ({
          key: event.id,
          id: event.id,
          tStart: event.tStart,
          tEnd: event.tEnd,
          status: statusOf(statuses, event),
          color,
          label: event.id,
        })),
      ),
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
  return [...rows, { id: "props", label: "props", hidden: 0, ...assignLanes(propBlocks) }];
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
    .filter((event) => statusOf(statuses, event) === "implausible")
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

export function fillOpacityFor(status: Status | undefined, playing: boolean): number {
  if (!playing) return 0.14;
  return status === "implausible" || status === "overridden" ? 0.24 : 0.34;
}

export function strokeFor(
  status?: Status,
  color: string = QUIET_STROKE,
  playing = false,
): { dash?: string; stroke: string; opacity: number } {
  if (status === undefined) return { stroke: PROP_COLOR, opacity: 1 };
  if (status === "proposed") return { dash: "5 3", stroke: "#ffffff", opacity: 0.4 };
  if (status === "implausible") return { dash: "5 3", stroke: "#ff4d4f", opacity: 1 };
  const opacity = playing ? ACTIVE_STROKE_OPACITY : ACTOR_STROKE_OPACITY;
  if (status === "overridden") return { stroke: color, opacity };
  return { stroke: color, opacity };
}
