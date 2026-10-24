import { useRef, useState, type PointerEvent } from "react";
import { useGraph } from "../playback/useGraph";
import { useSelection } from "../playback/useSelection";
import { useTimeline } from "../playback/useTimeline";
import { useSceneStore } from "../store";
import { createDrag, makeJump, makeKeyHandler } from "./handlers";
import {
  LABEL_W,
  LANE_H,
  ROW_H,
  TOP,
  TRACK_W,
  W,
  buildRows,
  implausibleStarts,
  neighborFlag,
  rowHeight,
  fillOpacityFor,
  rowTops,
  strokeFor,
  tOfX,
  xOf,
} from "./layout";

export { createDrag, makeJump, makeKeyHandler } from "./handlers";

export type TimelineProps = { onOpen?: (id: string) => void };

const SPEEDS = [0.5, 1, 2];
const AMBER = "#ffb020";
const PLAYHEAD_HIT_W = 14;
const BOTTOM_PAD_PX = 10;

const CSS = `
.rtl-root, .rtl-root * { -webkit-user-select: none; user-select: none; }
.rtl-root { cursor: default; }
.rtl-root:focus-visible { outline: 2px solid #e6ebf5; outline-offset: -2px; }
.rtl-root button:focus-visible { outline: 2px solid #e6ebf5; outline-offset: 1px; }
.rtl-playhead:focus { outline: none; }
.rtl-playhead:focus-visible .rtl-ring { visibility: visible; }
.rtl-root[data-scrubbing], .rtl-root[data-scrubbing] * { cursor: ew-resize !important; }
.rtl-block[data-event]:hover .rtl-fill { filter: brightness(1.35); }
`;

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
  const drag = useRef(createDrag()).current;
  const [scrubbing, setScrubbing] = useState(false);

  const rows = buildRows(resolved, statuses);
  const flags = implausibleStarts(resolved, statuses);
  const tops = rowTops(rows);
  const height = TOP + rows.reduce((sum, row) => sum + rowHeight(row), 0) + 6;
  const toggle = () => (playing ? pause() : play());

  const scrub = (event: PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setT(tOfX(((event.clientX - rect.left) / rect.width) * W, duration));
  };

  const jump = makeJump({ flags, t, select, setT });
  const onKeyDown = makeKeyHandler({ t, setT, toggle, duration });
  const endDrag = (e: PointerEvent) => {
    drag.end(e.pointerId);
    setScrubbing(drag.active());
  };
  const startDrag = (e: PointerEvent) => {
    if (!drag.down(e.pointerId, e.button)) return false;
    svgRef.current?.setPointerCapture?.(e.pointerId);
    setScrubbing(true);
    return true;
  };

  const ticks = Array.from({ length: Math.floor(duration) + 1 }, (_, i) => i).filter((i) => i % 2 === 0);

  return (
    <div
      tabIndex={0}
      className="rtl-root"
      data-scrubbing={scrubbing ? "" : undefined}
      onKeyDown={onKeyDown}
      style={{
        background: "#0e121a",
        color: "#e6ebf5",
        width: "100%",
        outline: "none",
        fontFamily: "system-ui, sans-serif",
        paddingBottom: BOTTOM_PAD_PX,
        boxSizing: "border-box",
      }}
    >
      <style>{CSS}</style>
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
          if ((e.target as Element).closest("[data-block]")) return;
          if (startDrag(e)) scrub(e);
        }}
        onPointerMove={(e) => drag.move(e.pointerId) && scrub(e)}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        <rect x={0} y={0} width={W} height={height} fill="#0e121a" />
        {ticks.map((s) => (
          <g key={s}>
            <line x1={xOf(s, duration)} x2={xOf(s, duration)} y1={TOP - 4} y2={height} stroke="#1f2736" />
            <text x={xOf(s, duration)} y={12} fill="#6f7c93" fontSize={10} textAnchor="middle" pointerEvents="none">
              {s}s
            </text>
          </g>
        ))}
        {rows.map((row, i) => {
          const rowY = tops[i]!;
          const rowH = rowHeight(row);
          return (
            <g key={row.id} data-row={row.id} data-lanes={row.lanes}>
              <rect x={LABEL_W} y={rowY + 2} width={TRACK_W} height={rowH - 4} fill="#141a26" />
              <text x={8} y={rowY + rowH / 2 + 4} fill="#c3cde0" fontSize={12} pointerEvents="none">
                {row.label}
                {row.hidden > 0 ? ` (${row.hidden} hidden)` : ""}
              </text>
              {row.blocks.map((b) => {
                const x = xOf(b.tStart, duration);
                const w = Math.max(xOf(b.tEnd, duration) - x, 2);
                const selected = b.id !== null && b.id === selectedEventId;
                const y = rowY + b.lane * LANE_H;
                const playingNow = b.id !== null && b.tStart <= t && t < b.tEnd;
                const s = strokeFor(b.status, b.color, playingNow);
                return (
                  <g
                    key={b.key}
                    data-block={b.key}
                    data-lane={b.lane}
                    data-status={b.status}
                    data-event={b.id ? "" : undefined}
                    data-playback-active={playingNow ? "true" : undefined}
                    className="rtl-block"
                    style={{ cursor: b.id ? "pointer" : "default" }}
                    onClick={() => b.id && select(b.id)}
                    onDoubleClick={() => b.id && onOpen?.(b.id)}
                  >
                    <rect x={x} y={y + 5} width={w} height={ROW_H - 10} rx={3} fill={b.color} fillOpacity={fillOpacityFor(b.status, playingNow)} className="rtl-fill" />
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
          className="rtl-playhead"
          role="slider"
          tabIndex={0}
          aria-label="Playhead"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={Number(duration.toFixed(1))}
          aria-valuenow={Number(t.toFixed(1))}
          aria-valuetext={`${t.toFixed(1)} of ${duration.toFixed(1)} seconds`}
          style={{ cursor: "ew-resize" }}
          onPointerDown={(e) => {
            startDrag(e);
            e.stopPropagation();
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
        >
          <rect x={xOf(t, duration) - PLAYHEAD_HIT_W / 2} y={TOP - 10} width={PLAYHEAD_HIT_W} height={height - TOP + 10} fill="transparent" />
          <rect
            className="rtl-ring"
            x={xOf(t, duration) - 9}
            y={TOP - 13}
            width={18}
            height={16}
            rx={3}
            fill="none"
            stroke="#e6ebf5"
            strokeWidth={2}
            visibility="hidden"
          />
          <line x1={xOf(t, duration)} x2={xOf(t, duration)} y1={TOP - 6} y2={height} stroke="#ff5d73" strokeWidth={2} />
          <rect x={xOf(t, duration) - 6} y={TOP - 10} width={12} height={10} rx={2} fill="#ff5d73" />
        </g>
      </svg>
    </div>
  );
}
