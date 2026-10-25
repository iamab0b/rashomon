import type { ResolvedGraph } from "@rashomon/engine";
import type { EventGraph, Status } from "@rashomon/schema";
import { statusOf } from "../playback/useGraph";

export const W = 1000;
export const LABEL_W = 120;
export const LABEL_COLUMN_W = LABEL_W - 8;
export const ROW_H = 34;
export const TOP = 22;
export const TRACK_W = W - LABEL_W - 10;
export const PLAYHEAD_HIT_W = 14;
export const PLAYHEAD_LINE_W = 2;

export type HitRect = { x: number; y: number; width: number; height: number };

export function playheadHitAreas(x: number, height: number): HitRect[] {
  return [
    { x: x - PLAYHEAD_HIT_W / 2, y: 0, width: PLAYHEAD_HIT_W, height: TOP },
    { x: x - PLAYHEAD_LINE_W / 2, y: TOP, width: PLAYHEAD_LINE_W, height: Math.max(height - TOP, 0) },
  ];
}

export function hits(rect: HitRect, px: number, py: number): boolean {
  return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
}
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
  witnessId?: string;
  inferred?: boolean;
  actionApproximated?: boolean;
  verb?: string;
};

export type Row = { id: string; label: string; blocks: Block[]; hidden: number; lanes: number };

export type StatusMap = Readonly<Record<string, Status>>;

const PALETTE: Record<string, string> = { witness: "#4f9dff", suspect: "#ff9f43", clerk: "#4cd6a0" };
const FALLBACK = ["#c58bff", "#f06fb5", "#9ad14b", "#e6d84f"];
const PROP_COLOR = "#8a94a6";
const QUIET_STROKE = "#4a5568";
const ACTOR_STROKE_OPACITY = 0.55;
const ACTIVE_STROKE_OPACITY = 0.9;
export const APPROXIMATED_DASH = "2 3";

export function rowLabel(label: string): string {
  const inner = /^witness \((.+)\)$/i.exec(label.trim())?.[1];
  return inner ? inner.charAt(0).toUpperCase() + inner.slice(1) : label;
}

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

const NO_IDS: ReadonlySet<string> = new Set();

export function inferredTimes(graph: Pick<EventGraph, "events"> | null): ReadonlySet<string> {
  if (!graph) return NO_IDS;
  return new Set(graph.events.filter((event) => event.tConfidence === "inferred").map((event) => event.id));
}

export function buildRows(resolved: ResolvedGraph | null, statuses: StatusMap, inferred: ReadonlySet<string> = NO_IDS): Row[] {
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
      label: rowLabel(actor.label),
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
          witnessId: event.witnessId,
          inferred: event.tInferred || inferred.has(event.id),
          ...(event.actionApproximated ? { actionApproximated: true } : {}),
          ...(event.actionApproximated && event.verb ? { verb: event.verb } : {}),
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
  approximated = false,
): { dash?: string; stroke: string; opacity: number } {
  const stroke = statusStroke(status, color, playing);
  return approximated ? { ...stroke, dash: APPROXIMATED_DASH } : stroke;
}

function statusStroke(
  status: Status | undefined,
  color: string,
  playing: boolean,
): { dash?: string; stroke: string; opacity: number } {
  if (status === undefined) return { stroke: PROP_COLOR, opacity: 1 };
  if (status === "proposed") return { dash: "5 3", stroke: "#ffffff", opacity: 0.4 };
  if (status === "implausible") return { dash: "5 3", stroke: IMPLAUSIBLE_STROKE, opacity: 1 };
  const opacity = playing ? ACTIVE_STROKE_OPACITY : ACTOR_STROKE_OPACITY;
  return { stroke: color, opacity };
}

export const WAVE_AMPLITUDE = 1.6;
export const WAVE_STEP = 4;
export const WAVE_INSET = 3;
export const SELECTION = { stroke: "#fff", width: 2, gap: 2, haloWidth: 1, haloOpacity: 0.8, tint: 0.08 } as const;
export const BORDER_W = 1.5;
export const PLAYBACK_TINT = "#a5dcff";
export const FOCUS_DIM_OPACITY = 0.3;

export const IMPLAUSIBLE_STROKE = "#ff4d4f";
export const SELECTED_IMPLAUSIBLE_STROKE = "#ff999a";

export function keepsStatusBorder(status?: Status): boolean {
  return status === "proposed";
}

export function borderFor(
  status: Status | undefined,
  color: string,
  playing: boolean,
  selected: boolean,
  approximated = false,
): { dash?: string; stroke: string; opacity: number; width: number; halo: boolean; fill: string; fillOpacity: number } {
  const s = strokeFor(status, color, playing, approximated);
  const fill = playing && status !== undefined ? PLAYBACK_TINT : color;
  const fillOpacity = Number((fillOpacityFor(status, playing) + (selected ? SELECTION.tint : 0)).toFixed(2));
  if (!selected) return { ...s, width: BORDER_W, halo: false, fill, fillOpacity };
  if (keepsStatusBorder(status)) return { ...s, width: SELECTION.width, halo: true, fill, fillOpacity };
  const stroke = status === "implausible" ? SELECTED_IMPLAUSIBLE_STROKE : SELECTION.stroke;
  return { ...(approximated ? { dash: APPROXIMATED_DASH } : {}), stroke, opacity: 1, width: SELECTION.width, halo: false, fill, fillOpacity };
}
export const WAVY_MIN_W = 14;

const r1 = (n: number) => Number(n.toFixed(1));

function wavyEdge(x: number, yFrom: number, yTo: number): string {
  const n = Math.max(2, Math.round(Math.abs(yTo - yFrom) / WAVE_STEP));
  const seg = (yTo - yFrom) / n;
  let d = "";
  for (let i = 0; i < n; i++) {
    const cx = x + (i % 2 === 0 ? WAVE_AMPLITUDE : -WAVE_AMPLITUDE);
    d += ` Q${r1(cx)},${r1(yFrom + seg * (i + 0.5))} ${r1(x)},${r1(yFrom + seg * (i + 1))}`;
  }
  return d;
}

export function inferredBlockPath(x: number, y: number, w: number, h: number): string {
  return `M${r1(x)},${r1(y)} L${r1(x + w)},${r1(y)}${wavyEdge(x + w, y, y + h)} L${r1(x)},${r1(y + h)}${wavyEdge(x, y + h, y)} Z`;
}
