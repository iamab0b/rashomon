import { CENTIMETRES, METRES } from "./alignment";
import type { LoadedScan } from "./scan";
import { useScanAlignStore } from "./scanAlignStore";
import { triangleCount } from "./scanGeom";

const panelStyle = {
  position: "absolute",
  top: 8,
  left: 8,
  width: 260,
  padding: "10px 12px",
  background: "rgba(11, 13, 16, 0.88)",
  color: "#c9d1d9",
  font: "12px/1.5 system-ui, sans-serif",
  borderRadius: 6,
  border: "1px solid #2a3039",
  zIndex: 21,
} as const;

const rowStyle = { display: "flex", alignItems: "center", gap: 6, marginTop: 6 } as const;

export function ScanPanel({ scan }: { scan: LoadedScan }) {
  const { aligning, metresPerUnit, origin, setAligning, setMetresPerUnit, setOrigin } = useScanAlignStore();
  return (
    <div style={panelStyle} data-scan-panel={scan.hash}>
      <div style={{ fontWeight: 600 }}>Scan {scan.hash.slice(0, 8)}</div>
      <div style={{ color: "#9aa7bd" }}>
        {scan.aligned ? "aligned" : "not aligned"} · {triangleCount(scan.geom).toLocaleString()} gate triangles
        {scan.supplied ? " · supplied manifest" : ""}
      </div>
      <label style={rowStyle}>
        metres per scan unit
        <input
          type="number"
          min={0}
          step="any"
          value={metresPerUnit}
          onChange={(event) => setMetresPerUnit(Number(event.target.value))}
          style={{ width: 64 }}
        />
        <button type="button" onClick={() => setMetresPerUnit(METRES)}>m</button>
        <button type="button" onClick={() => setMetresPerUnit(CENTIMETRES)}>cm</button>
      </label>
      <label style={rowStyle}>
        <input type="radio" checked={origin === "click"} onChange={() => setOrigin("click")} />
        origin at the clicked point
      </label>
      <label style={rowStyle}>
        <input type="radio" checked={origin === "bbox"} onChange={() => setOrigin("bbox")} />
        use bounding-box front-left corner
      </label>
      <div style={rowStyle}>
        <button type="button" aria-pressed={aligning} onClick={() => setAligning(!aligning)}>
          {aligning ? "Cancel" : "Align"}
        </button>
        {aligning ? <span>Click a point on the floor</span> : null}
      </div>
    </div>
  );
}
