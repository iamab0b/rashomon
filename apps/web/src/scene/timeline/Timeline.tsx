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
  inferredBlockPath,
  borderFor,
  SELECTION,
  WAVE_INSET,
  WAVY_MIN_W,
  inferredTimes,
  neighborFlag,
  playheadHitAreas,
  rowHeight,
  rowTops,
  tOfX,
  xOf,
} from "./layout";

export { createDrag, makeJump, makeKeyHandler } from "./handlers";

export type TimelineProps = { onOpen?: (id: string) => void };

const SPEEDS = [0.5, 1, 2];
const AMBER = "#ffb020";
const BOTTOM_PAD_PX = 14;
const HIDDEN_BLOCK_OPACITY = 0.15;

const CSS = `
.rtl-root, .rtl-root * { -webkit-user-select: none; user-select: none; }
.rtl-root { cursor: default; }
.rtl-root:focus-visible { outline: 2px solid #e6ebf5; outline-offset: -2px; }
.rtl-root button:focus-visible { outline: 2px solid #e6ebf5; outline-offset: 1px; }
.rtl-playhead:focus { outline: none; }
.rtl-playhead:focus-visible .rtl-ring { visibility: visible; }
.rtl-root[data-scrubbing], .rtl-root[data-scrubbing] * { cursor: ew-resize !important; }
.rtl-block[data-event]:hover .rtl-fill { filter: brightness(1.35); }
.rtl-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 0; padding: 6px 8px; }
.rtl-toolbar button { font: 12px system-ui, sans-serif; cursor: pointer; }
.rtl-toolbar button:disabled { cursor: default; opacity: .4; }
.rtl-play { display: grid; place-items: center; width: 34px; height: 28px; margin-right: 14px; color: #0e121a; background: #e6ebf5; border: 0; border-radius: 4px; }
.rtl-play:hover { background: #ffffff; }
.rtl-group { display: inline-flex; align-items: center; padding: 0 14px; border-left: 1px solid #263044; }
.rtl-speed { display: inline-flex; border: 1px solid #34405a; border-radius: 4px; overflow: hidden; }
.rtl-speed button { padding: 3px 9px; color: #9aa7bd; background: transparent; border: 0; }
.rtl-speed button + button { border-left: 1px solid #34405a; }
.rtl-speed button[aria-pressed="true"] { color: #e6ebf5; background: #2f3b52; font-weight: 600; }
.rtl-flags { gap: 2px; }
.rtl-flags button { display: inline-flex; align-items: center; gap: 5px; padding: 3px 6px; color: #9aa7bd; background: transparent; border: 0; border-radius: 4px; }
.rtl-flags button:not(:disabled):hover { color: #e6ebf5; background: #1a2130; }
.rtl-time { margin-left: auto; padding-left: 14px; color: #9aa7bd; font-size: 12px; font-variant-numeric: tabular-nums; }
@media (max-width: 760px) { .rtl-flag-text { display: none; } }
`;

const PLAY_ICON = "M4 2.5v11l9-5.5z";
const PAUSE_ICON = "M4 2.5h3v11H4zM9 2.5h3v11H9z";

export function Timeline({ onOpen }: TimelineProps) {
  const { resolved, statuses } = useGraph();
  const { t, playing, speed, duration, setT, play, pause } = useTimeline();
  const { selectedEventId, select } = useSelection();
  const setSpeed = useSceneStore((s) => s.setSpeed);
  const hiddenWitnesses = useSceneStore((s) => s.hiddenWitnesses);
  const graph = useSceneStore((s) => s.graph);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef(createDrag()).current;
  const [scrubbing, setScrubbing] = useState(false);

  const rows = buildRows(resolved, statuses, inferredTimes(graph));
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
      <div className="rtl-toolbar">
        <button
          type="button"
          className="rtl-play"
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause (Space)" : "Play (Space)"}
          aria-keyshortcuts="Space"
          onClick={toggle}
        >
          <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden>
            <path d={playing ? PAUSE_ICON : PLAY_ICON} fill="currentColor" />
          </svg>
        </button>
        <div className="rtl-group" role="group" aria-label="Playback speed">
          <div className="rtl-speed">
            {SPEEDS.map((s) => (
              <button key={s} type="button" aria-pressed={speed === s} title={`${s}× speed`} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
        </div>
        <div className="rtl-group rtl-flags" role="group" aria-label="Flag navigation">
          <button
            type="button"
            aria-label="Previous flag"
            title="Previous flag"
            onClick={() => jump(-1)}
            disabled={!neighborFlag(flags, t, -1)}
          >
            <span aria-hidden>←</span>
            <span className="rtl-flag-text">Previous flag</span>
          </button>
          <button
            type="button"
            aria-label="Next flag"
            title="Next flag"
            onClick={() => jump(1)}
            disabled={!neighborFlag(flags, t, 1)}
          >
            <span className="rtl-flag-text">Next flag</span>
            <span aria-hidden>→</span>
          </button>
        </div>
        <span className="rtl-time">
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
                const s = borderFor(b.status, b.color, playingNow, selected, b.actionApproximated === true);
                const h = ROW_H - 10;
                const wavy = b.inferred && w >= WAVY_MIN_W ? inferredBlockPath(x + WAVE_INSET, y + 5, w - 2 * WAVE_INSET, h) : null;
                const g = SELECTION.gap;
                const halo = { fill: "none", stroke: SELECTION.stroke, strokeOpacity: SELECTION.haloOpacity, strokeWidth: SELECTION.haloWidth, "data-selection": "" };
                return (
                  <g
                    key={b.key}
                    data-block={b.key}
                    data-lane={b.lane}
                    data-status={b.status}
                    data-inferred={b.inferred ? "" : undefined}
                    data-event={b.id ? "" : undefined}
                    data-playback-active={playingNow ? "true" : undefined}
                    data-approximated={b.actionApproximated ? "true" : undefined}
                    data-verb={b.verb}
                    className="rtl-block"
                    style={{ cursor: b.id ? "pointer" : "default", ...(b.witnessId !== undefined && hiddenWitnesses.has(b.witnessId) ? { opacity: HIDDEN_BLOCK_OPACITY } : {}) }}
                    onClick={() => b.id && select(b.id)}
                    onDoubleClick={() => b.id && onOpen?.(b.id)}
                  >
                    {wavy ? (
                      <>
                        <rect x={x} y={y + 5} width={w} height={h} fill="transparent" className="rtl-hit" />
                        <path d={wavy} fill={b.color} fillOpacity={s.fillOpacity} className="rtl-fill" />
                        <path
                          d={wavy}
                          fill="none"
                          stroke={s.stroke}
                          strokeOpacity={s.opacity}
                          strokeDasharray={s.dash}
                          strokeLinejoin="round"
                          strokeWidth={s.width}
                        />
                        {s.halo && <path d={inferredBlockPath(x + WAVE_INSET - g, y + 5 - g, w - 2 * (WAVE_INSET - g), h + 2 * g)} strokeLinejoin="round" {...halo} />}
                      </>
                    ) : (
                      <>
                        <rect x={x} y={y + 5} width={w} height={h} rx={3} fill={b.color} fillOpacity={s.fillOpacity} className="rtl-fill" />
                        <rect
                          x={x}
                          y={y + 5}
                          width={w}
                          height={h}
                          rx={3}
                          fill="none"
                          stroke={s.stroke}
                          strokeOpacity={s.opacity}
                          strokeDasharray={s.dash}
                          strokeWidth={s.width}
                        />
                        {s.halo && <rect x={x - g} y={y + 5 - g} width={w + 2 * g} height={h + 2 * g} rx={3 + g} {...halo} />}
                      </>
                    )}
                    {b.status === "overridden" && <polygon points={`${x + w - 9},${y + 5} ${x + w},${y + 5} ${x + w},${y + 14}`} fill={AMBER} />}
                    <text x={x + 5} y={y + ROW_H / 2 + 4} fill="#e6ebf5" fontSize={10} pointerEvents="none">
                      {b.label}
                    </text>
                    {b.inferred && <title>{`${b.label} · estimated time: the witness gave no time`}</title>}
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
          {playheadHitAreas(xOf(t, duration), height).map((r, i) => (
            <rect key={i} data-playhead-hit x={r.x} y={r.y} width={r.width} height={r.height} fill="transparent" />
          ))}
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
          <line x1={xOf(t, duration)} x2={xOf(t, duration)} y1={TOP - 6} y2={height} stroke="#ff5d73" strokeWidth={2} pointerEvents="none" />
          <rect x={xOf(t, duration) - 6} y={TOP - 10} width={12} height={10} rx={2} fill="#ff5d73" pointerEvents="none" />
        </g>
      </svg>
    </div>
  );
}
