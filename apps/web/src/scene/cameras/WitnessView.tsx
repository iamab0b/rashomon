import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Frustum, Mesh, Vector3, type Object3D } from "three";
import { setOpacity } from "../characters/materials";
import { playbacksFor } from "../playback/playbacks";
import { useSceneStore } from "../store";
import { CHEST_HEIGHT_M, followedActorId } from "./povSightline";
import { isPovActive } from "./useCamera";
import { DIMMED_OPACITY, frustumOf, isMeshVisible, isPointVisible } from "./visibility";

const FLOOR_NAME = "floor";

type Props = {
  model: Object3D;
};

function collectMeshes(model: Object3D): { targets: Mesh[]; occluders: Mesh[] } {
  const targets: Mesh[] = [];
  const occluders: Mesh[] = [];
  model.traverse((object) => {
    if (!(object instanceof Mesh) || object.name === FLOOR_NAME) return;
    targets.push(object);
    if (object.userData.collision !== false) occluders.push(object);
  });
  return { targets, occluders };
}

export function WitnessView({ model }: Props) {
  const camera = useThree((state) => state.camera);
  const { targets, occluders } = useMemo(() => collectMeshes(model), [model]);
  const applied = useRef(new Map<Mesh, number>());
  const frustum = useMemo(() => new Frustum(), []);
  const chest = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const state = useSceneStore.getState();
    const active = isPovActive(state);
    const eye = camera.position;
    if (active) frustumOf(camera, frustum);
    const dimmedMeshes = new Set<string>();
    for (const mesh of targets) {
      const opacity = !active || isMeshVisible(eye, mesh, frustum, occluders) ? 1 : DIMMED_OPACITY;
      if (opacity < 1) dimmedMeshes.add(mesh.name);
      if (applied.current.get(mesh) === opacity) continue;
      setOpacity(mesh, opacity);
      applied.current.set(mesh, opacity);
    }
    const dimmed = new Set<string>();
    if (active && state.resolved) {
      const { byId, positionOf } = playbacksFor(state.resolved, state.statuses);
      const followed = followedActorId(state);
      for (const actorId of byId.keys()) {
        if (actorId === followed) continue;
        const feet = positionOf(actorId, state.t);
        if (!feet) continue;
        chest.set(feet[0], feet[1] + CHEST_HEIGHT_M, feet[2]);
        if (!isPointVisible(eye, chest, frustum, occluders)) dimmed.add(actorId);
      }
    }
    state.setDimmedActors(dimmed);
    state.setDimmedMeshes(dimmedMeshes);
  });

  return null;
}
