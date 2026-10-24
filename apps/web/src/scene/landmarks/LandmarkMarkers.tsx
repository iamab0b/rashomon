import { Line } from "@react-three/drei";
import type { Landmark } from "@rashomon/schema";

const FLOOR_LIFT = 0.02;
const DISC_RADIUS = 0.12;
const ZONE_COLOR = "#4fb3ff";
const MARKER_COLOR = "#ffd24a";
const OCCLUDER_COLOR = "#ff6b5e";
const OCCLUDER_OPACITY = 0.22;
const DASH_SIZE = 0.15;
const GAP_SIZE = 0.1;

function ZoneOutline({ landmark }: { landmark: Landmark }) {
  const { min, max } = landmark.bounds;
  const y = min[1] + FLOOR_LIFT;
  const points: [number, number, number][] = [
    [min[0], y, min[2]],
    [max[0], y, min[2]],
    [max[0], y, max[2]],
    [min[0], y, max[2]],
    [min[0], y, min[2]],
  ];
  return (
    <Line points={points} color={ZONE_COLOR} lineWidth={1.5} dashed dashSize={DASH_SIZE} gapSize={GAP_SIZE} />
  );
}

function OccluderBox({ landmark }: { landmark: Landmark }) {
  const { min, max } = landmark.bounds;
  return (
    <mesh
      position={[(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]}
      scale={1.002}
    >
      <boxGeometry args={[max[0] - min[0], max[1] - min[1], max[2] - min[2]]} />
      <meshBasicMaterial
        color={OCCLUDER_COLOR}
        transparent
        opacity={OCCLUDER_OPACITY}
        depthWrite={false}
      />
    </mesh>
  );
}

function Marker({ landmark }: { landmark: Landmark }) {
  const [x, y, z] = landmark.position;
  return (
    <group>
      <mesh position={[x, y + FLOOR_LIFT, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[DISC_RADIUS, 24]} />
        <meshBasicMaterial color={MARKER_COLOR} />
      </mesh>
      {landmark.kind === "zone" ? <ZoneOutline landmark={landmark} /> : null}
      {landmark.occludes ? <OccluderBox landmark={landmark} /> : null}
    </group>
  );
}

export function LandmarkMarkers({ landmarks }: { landmarks: readonly Landmark[] }) {
  return (
    <>
      {landmarks.map((landmark) => (
        <Marker key={landmark.id} landmark={landmark} />
      ))}
    </>
  );
}
