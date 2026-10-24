import type { Interior } from "@rashomon/schema";
import { useSceneStore } from "./store";

const FALLBACK_SPAN = 40;

export function FloorProbe({ interior }: { interior: Interior | undefined }) {
  const setFloorHit = useSceneStore((state) => state.setFloorHit);
  const width = interior ? interior.max[0] - interior.min[0] : FALLBACK_SPAN;
  const depth = interior ? interior.max[2] - interior.min[2] : FALLBACK_SPAN;
  const cx = interior ? interior.min[0] + width / 2 : 0;
  const cz = interior ? interior.min[2] + depth / 2 : 0;
  return (
    <mesh
      position={[cx, 0, cz]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={(event) => setFloorHit([event.point.x, event.point.y, event.point.z])}
      onPointerOut={() => setFloorHit(null)}
    >
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}
