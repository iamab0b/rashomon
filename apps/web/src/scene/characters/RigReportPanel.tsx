import { useRigReportStore } from "./rigReportStore";

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
  return (
    <div style={panelStyle}>
      <div>debug=rig · ruler 1.75 m, tick at 1.0 m</div>
      {reports.map((report) => (
        <div key={report.rig}>
          {report.rig}: {report.hipBone} · hip y {report.hipY.toFixed(2)} m · height {report.height.toFixed(2)} m
        </div>
      ))}
    </div>
  );
}
