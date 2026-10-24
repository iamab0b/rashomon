import { Edges, PivotControls } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { Interior, Landmark } from "@rashomon/schema";
import { useMemo } from "react";
import { Matrix4, Vector3 } from "three";
import { boxOfLandmark } from "./boxes";
import { useLabelingStore } from "./labelingStore";

const FALLBACK_SPAN = 40;
const CLICK_SLOP_PX = 3;
const GIZMO_SCALE_PX = 80;
const ACTIVE_AXES: [boolean, boolean, boolean] = [true, false, true];
const SELECTED_COLOR = "#ffd24a";
const IDLE_COLOR = "#4fb3ff";

function EditBox({ landmark, selected }: { landmark: Landmark; selected: boolean }) {
  const select = useLabelingStore((state) => state.select);
  const box = boxOfLandmark(landmark);
  const color = selected ? SELECTED_COLOR : IDLE_COLOR;
  return (
    <mesh
      position={[box.cx, box.floorY + box.height / 2, box.cz]}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        if (event.delta > CLICK_SLOP_PX) return;
        event.stopPropagation();
        select(landmark.id);
      }}
    >
      <boxGeometry args={[box.width, box.height, box.depth]} />
      <meshBasicMaterial color={color} transparent opacity={selected ? 0.22 : 0.1} depthWrite={false} />
      <Edges color={color} />
    </mesh>
  );
}

function SelectedGizmo({ landmark }: { landmark: Landmark }) {
  const moveTo = useLabelingStore((state) => state.moveTo);
  const box = boxOfLandmark(landmark);
  const matrix = useMemo(() => new Matrix4().makeTranslation(box.cx, box.floorY, box.cz), [box.cx, box.floorY, box.cz]);
  return (
    <PivotControls
      matrix={matrix}
      autoTransform={false}
      activeAxes={ACTIVE_AXES}
      disableRotations
      disableScaling
      fixed
      scale={GIZMO_SCALE_PX}
      onDrag={(_local, _deltaLocal, world) => {
        const point = new Vector3().setFromMatrixPosition(world);
        moveTo(landmark.id, point.x, point.z);
      }}
    />
  );
}

function FloorPlane({ interior }: { interior: Interior | undefined }) {
  const addAt = useLabelingStore((state) => state.addAt);
  const width = interior ? interior.max[0] - interior.min[0] : FALLBACK_SPAN;
  const depth = interior ? interior.max[2] - interior.min[2] : FALLBACK_SPAN;
  const cx = interior ? interior.min[0] + width / 2 : 0;
  const cz = interior ? interior.min[2] + depth / 2 : 0;
  return (
    <mesh
      position={[cx, 0, cz]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        if (event.delta > CLICK_SLOP_PX) return;
        event.stopPropagation();
        addAt([event.point.x, 0, event.point.z]);
      }}
    >
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

export function EditorLayer() {
  const landmarks = useLabelingStore((state) => state.landmarks);
  const selectedId = useLabelingStore((state) => state.selectedId);
  const interior = useLabelingStore((state) => state.interior);
  const selected = landmarks.find((landmark) => landmark.id === selectedId) ?? null;
  return (
    <>
      <FloorPlane interior={interior} />
      {landmarks.map((landmark, index) => (
        <EditBox key={index} landmark={landmark} selected={landmark.id === selectedId} />
      ))}
      {selected ? <SelectedGizmo landmark={selected} /> : null}
    </>
  );
}
