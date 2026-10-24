import { useEffect, useState } from "react";
import { AnimationMixer, type Bone, type Object3D, type SkinnedMesh } from "three";
import type { Material } from "three";
import { disposeMaterials, ownMaterials } from "./materials";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  findHipBone,
  findPrimarySkinnedMesh,
  findSkinnedMeshes,
  loadRig,
  MIXAMO_UNIT_SCALE,
  type Rig,
} from "./rigs";

export type CharacterHandle = {
  rig: Rig;
  root: Object3D;
  skinnedMeshes: readonly SkinnedMesh[];
  mixer: AnimationMixer;
  hips: Bone | undefined;
  ownedMaterials: readonly Material[];
};

type Props = {
  rig: Rig;
  position: readonly [number, number, number];
  onReady?: (handle: CharacterHandle) => void;
};

function instantiate(rig: Rig, source: Object3D): CharacterHandle {
  const root = cloneSkinned(source);
  root.scale.setScalar(MIXAMO_UNIT_SCALE);
  const ownedMaterials = ownMaterials(root);
  root.traverse((object) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });
  const skinnedMeshes = findSkinnedMeshes(root);
  const mixerRoot = findPrimarySkinnedMesh(skinnedMeshes);
  if (!mixerRoot) throw new Error(`rig ${rig} has no SkinnedMesh with a primary skeleton`);
  return {
    rig,
    root,
    skinnedMeshes,
    mixer: new AnimationMixer(mixerRoot),
    hips: findHipBone(mixerRoot),
    ownedMaterials,
  };
}

export function useCharacter(rig: Rig): CharacterHandle | null {
  const [handle, setHandle] = useState<CharacterHandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadRig(rig)
      .then((source) => {
        if (!cancelled) setHandle(instantiate(rig, source));
      })
      .catch((error: unknown) => {
        console.error(`character rig ${rig} failed to load`, error);
      });
    return () => {
      cancelled = true;
    };
  }, [rig]);

  useEffect(() => {
    if (!handle) return;
    return () => {
      handle.mixer.stopAllAction();
      handle.mixer.uncacheRoot(handle.mixer.getRoot());
      disposeMaterials(handle.ownedMaterials);
    };
  }, [handle]);

  return handle;
}

export function Character({ rig, position, onReady }: Props) {
  const handle = useCharacter(rig);

  useEffect(() => {
    if (handle) onReady?.(handle);
  }, [handle, onReady]);

  if (!handle) return null;
  return (
    <group position={[...position]}>
      <primitive object={handle.root} />
    </group>
  );
}
