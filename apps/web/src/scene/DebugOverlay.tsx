import { useSceneStore } from "./store";

const overlayStyle = {
  position: "absolute",
  top: 8,
  left: 8,
  padding: "6px 10px",
  background: "rgba(11, 13, 16, 0.8)",
  color: "#c9d1d9",
  font: "12px/1.5 ui-monospace, monospace",
  borderRadius: 4,
  pointerEvents: "none",
  zIndex: 20,
} as const;

function formatHit(hit: readonly [number, number, number] | null): string {
  if (!hit) return "-";
  return `${hit[0].toFixed(2)}, ${hit[2].toFixed(2)}`;
}

function formatNames(names: ReadonlySet<string>): string {
  return names.size === 0 ? "-" : [...names].sort().join(", ");
}

export function DebugOverlay() {
  const visible = useSceneStore((state) => state.debugVisible);
  const fps = useSceneStore((state) => state.fps);
  const preset = useSceneStore((state) => state.preset);
  const floorHit = useSceneStore((state) => state.floorHit);
  const following = useSceneStore((state) => state.povFollow);
  const dimmedMeshes = useSceneStore((state) => state.dimmedMeshes);
  const dimmedActors = useSceneStore((state) => state.dimmedActors);
  if (!visible) return null;
  return (
    <div style={overlayStyle}>
      <div>fps {fps}</div>
      <div>cam {following ? "pov (following)" : preset}</div>
      <div>floor x,z {formatHit(floorHit)}</div>
      <div>dimmed meshes {formatNames(dimmedMeshes)}</div>
      <div>dimmed actors {formatNames(dimmedActors)}</div>
    </div>
  );
}
