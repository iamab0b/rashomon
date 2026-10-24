import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useGraph, useSelection, useTimeline } from "../index";
import { useSceneStore } from "../store";
import {
  LABEL_W,
  ROW_H,
  TOP,
  TRACK_W,
  W,
  buildRows,
  implausibleStarts,
  neighborFlag,
  nudgeDelta,
  strokeFor,
  tOfX,
  xOf,
} from "./layout";

export type TimelineProps = { onOpen?: (id: string) => void };

const SPEEDS = [0.5, 1, 2];
const AMBER = "#ffb020";

const btn = (active = false) => ({
  background: active ? "#2f3b52" : "#1a2130",
  color: "#e6ebf5",
  border: "1px solid #34405a",
  borderRadius: 4,
  padding: "3px 10px",
  fontSize: 12,
  cursor: "pointer",
});

export function Timeline({ onOpen }: TimelineProps) {
  const { resolved, statuses } = useGraph();
  const { t, playing, speed, duration, setT, play, pause } = useTimeline();
  const { selectedEventId, select } = useSelection();
  const setSpeed = useSceneStore((s) => s.setSpeed);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const rows = buildRows(resolved, statuses);
  const flags = implausibleStarts(resolved, statuses);
  const height = TOP + rows.length * ROW_H + 6;
  const toggle = () => (playing ? pause() : play());

  const scrub = (event: PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setT(tOfX(((event.clientX - rect.left) / rect.width) * W, duration));
  };

  const jump = (dir: 1 | -1) => {
    const target = neighborFlag(flags, t, dir);
    if (!target) return;
    select(target.id);
    setT(target.tStart);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const onButton = (event.target as HTMLElement).tagName === "BUTTON";
    if (event.key === " " && !onButton) {
      event.preventDefault();
      toggle();
      return;
    }
    const delta = nudgeDelta(event.key, event.shiftKey);
    if (delta === null) return;
    event.preventDefault();
    setT(t + delta);
  };

  const ticks = Array.from({ length: Math.floor(duration) + 1 }, (_, i) => i).filter((i) => i % 2 === 0);

  return (
    <div
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{ background: "#0e121a", color: "#e6ebf5", width: "100%", outline: "none", fontFamily: "system-ui, sans-serif" }}
    >
      <div style={{ display: "flex", gap: 6, padding: "6px 8px", alignItems: "center" }}>
        <button type="button" style={btn()} onClick={toggle}>
          {playing ? "Pause" : "Play"}
        </button>
        {SPEEDS.map((s) => (
          <button key={s} type="button" style={btn(speed === s)} onClick={() => setSpeed(s)}>
            {s}x
          </button>
        ))}
        <button type="button" style={btn()} onClick={() => jump(-1)} disabled={!neighborFlag(flags, t, -1)}>
          Prev flag
        </button>
        <button type="button" style={btn()} onClick={() => jump(1)} disabled={!neighborFlag(flags, t, 1)}>
          Next flag
        </button>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#9aa7bd" }}>
          {t.toFixed(1)} / {duration.toFixed(1)} s
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        style={{ display: "block", touchAction: "none", userSelect: "none" }}
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as Element).closest("[data-block]")) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          scrub(e);
        }}
        onPointerMove={(e) => dragging.current && scrub(e)}
        onPointerUp={() => (dragging.current = false)}
      >
        <rect x={0} y={0} width={W} height={height} fill="#0e121a" />
        {ticks.map((s) => (
          <g key={s}>
            <line x1={xOf(s, duration)} x2={xOf(s, duration)} y1={TOP - 4} y2={height} stroke="#1f2736" />
            <text x={xOf(s, duration)} y={12} fill="#6f7c93" fontSize={10} textAnchor="middle">
              {s}s
            </text>
          </g>
        ))}
        {rows.map((row, i) => {
          const y = TOP + i * ROW_H;
          return (
            <g key={row.id} data-row={row.id}>
              <rect x={LABEL_W} y={y + 2} width={TRACK_W} height={ROW_H - 4} fill="#141a26" />
              <text x={8} y={y + ROW_H / 2 + 4} fill="#c3cde0" fontSize={12}>
                {row.label}
                {row.hidden > 0 ? ` (${row.hidden} hidden)` : ""}
              </text>
              {row.blocks.map((b) => {
                const x = xOf(b.tStart, duration);
                const w = Math.max(xOf(b.tEnd, duration) - x, 2);
                const s = strokeFor(b.status);
                const selected = b.id !== null && b.id === selectedEventId;
                return (
                  <g
                    key={b.key}
                    data-block={b.key}
                    data-status={b.status}
                    style={{ cursor: b.id ? "pointer" : "default" }}
                    onClick={() => b.id && select(b.id)}
                    onDoubleClick={() => b.id && onOpen?.(b.id)}
                  >
                    <rect x={x} y={y + 5} width={w} height={ROW_H - 10} rx={3} fill={b.color} fillOpacity={0.28} />
                    <rect
                      x={x}
                      y={y + 5}
                      width={w}
                      height={ROW_H - 10}
                      rx={3}
                      fill="none"
                      stroke={s.stroke}
                      strokeOpacity={s.opacity}
                      strokeDasharray={s.dash}
                      strokeWidth={selected ? 3 : 1.5}
                    />
                    {selected && <rect x={x - 2} y={y + 3} width={w + 4} height={ROW_H - 6} rx={4} fill="none" stroke="#fff" />}
                    {b.status === "overridden" && <polygon points={`${x + w - 9},${y + 5} ${x + w},${y + 5} ${x + w},${y + 14}`} fill={AMBER} />}
                    <text x={x + 5} y={y + ROW_H / 2 + 4} fill="#e6ebf5" fontSize={10} pointerEvents="none">
                      {b.label}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
        <g
          data-playhead
          style={{ cursor: "ew-resize" }}
          onPointerDown={(e) => {
            dragging.current = true;
            svgRef.current?.setPointerCapture?.(e.pointerId);
            e.stopPropagation();
          }}
        >
          <line x1={xOf(t, duration)} x2={xOf(t, duration)} y1={TOP - 6} y2={height} stroke="#ff5d73" strokeWidth={2} />
          <rect x={xOf(t, duration) - 6} y={TOP - 10} width={12} height={10} rx={2} fill="#ff5d73" />
        </g>
      </svg>
    </div>
  );
}
