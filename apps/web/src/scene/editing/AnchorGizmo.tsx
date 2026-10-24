import { PivotControls } from "@react-three/drei";
import type { SceneManifest } from "@rashomon/schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { Matrix4, Vector3 } from "three";
import { useGraphActions } from "../playback/useGraphActions";
import { useSelection } from "../playback/useSelection";
import { useSceneStore } from "../store";
import { dropFieldOf, type DropField } from "./anchorDrop";
import { commitDrop } from "./commitDrop";
import { createDragSession } from "./dragSession";

const GIZMO_SCALE_PX = 80;
const ACTIVE_AXES: [boolean, boolean, boolean] = [true, false, true];

type GizmoProps = {
  eventId: string;
  field: DropField;
  home: readonly [number, number, number];
  manifest: SceneManifest;
};

function Gizmo({ eventId, field, home, manifest }: GizmoProps) {
  const { applyPatches } = useGraphActions();
  const errorEpoch = useSceneStore((state) => state.errorEpoch);
  const setActionError = useSceneStore((state) => state.setActionError);
  const homeMatrix = useMemo(() => new Matrix4().makeTranslation(home[0], home[1], home[2]), [home]);
  const [matrix, setMatrix] = useState(homeMatrix);
  const session = useRef(createDragSession()).current;

  useEffect(() => {
    setMatrix(homeMatrix);
  }, [homeMatrix, errorEpoch]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && session.cancel()) setMatrix(homeMatrix);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [session, homeMatrix]);

  return (
    <PivotControls
      matrix={matrix}
      autoTransform={false}
      activeAxes={ACTIVE_AXES}
      disableRotations
      disableScaling
      fixed
      scale={GIZMO_SCALE_PX}
      onDragStart={() => session.start()}
      onDrag={(_local, _deltaLocal, world) => {
        if (!session.active()) return;
        const point = new Vector3().setFromMatrixPosition(world);
        session.move([point.x, point.y, point.z]);
        setMatrix(world.clone());
      }}
      onDragEnd={() => {
        const dropped = session.end();
        if (!dropped) {
          setMatrix(homeMatrix);
          return;
        }
        const outcome = commitDrop({ id: eventId, field }, dropped, {
          manifest,
          eventOf: (id) => useSceneStore.getState().graphSource?.eventOf?.(id),
          applyPatches,
          setActionError,
        });
        if (outcome.kind !== "sent") setMatrix(homeMatrix);
      }}
    />
  );
}

export function AnchorGizmo({ manifest }: { manifest: SceneManifest }) {
  const { selectedEventId } = useSelection();
  const event = useSceneStore((state) => state.resolved?.events.find((e) => e.id === selectedEventId) ?? null);
  if (!event) return null;
  const field = dropFieldOf(event);
  const home = field === "from" ? event.from : event.at;
  if (!home) return null;
  return <Gizmo key={`${event.id}:${field}`} eventId={event.id} field={field} home={home} manifest={manifest} />;
}
