import type { SceneManifest } from "@rashomon/schema";
import { useRigReportStore } from "./rigReportStore";

const GATE_EYE_HEIGHT_M: SceneManifest["eyeHeight"] = 1.6;

const panelStyle = {
  position: "absolute",
  right: 8,
  top: 8,
  padding: "6px 10px",
  background: "rgba(11, 13, 16, 0.85)",
  color: "#c9d1d9",
  font: "12px/1.6 ui-monospace, monospace",
  borderRadius: 4,
  pointerEvents: "none",
  zIndex: 20,
} as const;

export function RigReportPanel() {
  const reports = useRigReportStore((state) => state.reports);
  const clipLines = useRigReportStore((state) => state.clipLines);
  return (
    <div style={panelStyle}>
      <div>debug=rig · ruler 1.75 m, tick at 1.0 m · the gate's sightline uses eye height {GATE_EYE_HEIGHT_M} m for everyone</div>
      {reports.map((report) => (
        <div key={report.name} data-rig={report.name}>
          {report.name}: {report.bones} bones · {report.hipBone} · hip y {report.hipY.toFixed(2)} m · eye y{" "}
          {report.eyeY.toFixed(2)} m{report.eyeEstimated ? " (est.)" : ""} · height {report.height.toFixed(2)} m
        </div>
      ))}
      {clipLines.map((line) => (
        <div key={line.clip} data-clip={line.clip}>
          {line.tStart}–{line.tEnd} s · {line.action}
          {line.style ? ` ${line.style}` : ""} · {line.clip}
          {line.plays === line.clip ? "" : ` missing, plays ${line.plays}`}
        </div>
      ))}
    </div>
  );
}
