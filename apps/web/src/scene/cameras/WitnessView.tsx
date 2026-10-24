import { useFrame, useThree } from "@react-three/fiber";
import type { SceneManifest } from "@rashomon/schema";
import { useMemo, useRef } from "react";
import { Frustum, Mesh, Vector3, type Object3D } from "three";
import { setOpacity } from "../characters/materials";
import { playbacksFor } from "../playback/playbacks";
import { useSceneStore } from "../store";
import { landmarkOccluders } from "./landmarkOccluders";
import { CHEST_HEIGHT_M, followedActorId } from "./povSightline";
import { isPovActive } from "./useCamera";
import { DIMMED_OPACITY, frustumOf, isMeshVisible, isPointVisible } from "./visibility";

const FLOOR_NAME = "floor";

type Props = {
  model: Object3D;
  manifest: SceneManifest;
};

function collectTargets(model: Object3D): Mesh[] {
  const targets: Mesh[] = [];
  model.traverse((object) => {
    if (object instanceof Mesh && object.name !== FLOOR_NAME) targets.push(object);
  });
  return targets;
}

export function WitnessView({ model, manifest }: Props) {
  const camera = useThree((state) => state.camera);
  const targets = useMemo(() => collectTargets(model), [model]);
  const occluders = useMemo(() => landmarkOccluders(manifest), [manifest]);
  const applied = useRef(new Map<Mesh, number>());
  const frustum = useMemo(() => new Frustum(), []);
  const chest = useMemo(() => new Vector3(), []);
  const dimmedMeshes = useMemo(() => new Set<string>(), []);
  const dimmedActors = useMemo(() => new Set<string>(), []);
  const wasActive = useRef(false);

  useFrame(() => {
    const state = useSceneStore.getState();
    const active = isPovActive(state);
    if (!active && !wasActive.current) return;
    wasActive.current = active;
    const eye = camera.position;
    dimmedMeshes.clear();
    dimmedActors.clear();
    if (active) frustumOf(camera, frustum);
    for (const mesh of targets) {
      const visible = !active || isMeshVisible(eye, mesh, frustum, occluders.boxes, occluders.boxFor(mesh.name));
      const opacity = visible ? 1 : DIMMED_OPACITY;
      if (!visible) dimmedMeshes.add(mesh.name);
      if (applied.current.get(mesh) === opacity) continue;
      setOpacity(mesh, opacity);
      applied.current.set(mesh, opacity);
    }
    if (active && state.resolved) {
      const { byId, positionOf } = playbacksFor(state.resolved, state.statuses);
      const followed = followedActorId(state);
      for (const actorId of byId.keys()) {
        if (actorId === followed) continue;
        const feet = positionOf(actorId, state.t);
        if (!feet) continue;
        chest.set(feet[0], feet[1] + CHEST_HEIGHT_M, feet[2]);
        if (!isPointVisible(eye, chest, frustum, occluders.boxes)) dimmedActors.add(actorId);
      }
    }
    state.setDimmedActors(dimmedActors);
    state.setDimmedMeshes(dimmedMeshes);
  });

  return null;
}
