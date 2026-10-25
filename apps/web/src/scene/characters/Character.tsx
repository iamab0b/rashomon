import type { ActorBody } from "@rashomon/schema";
import { useEffect, useState } from "react";
import { AnimationMixer, type Bone, type Object3D, type SkinnedMesh } from "three";
import type { Material } from "three";
import { bodyScale, loadLook, type CharacterLook, type LoadedLook } from "./bodies";
import { disposeMaterials, ownMaterials, tintClothing } from "./materials";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  findHipBone,
  findRightHand,
  findPrimarySkinnedMesh,
  findSkinnedMeshes,
  MIXAMO_UNIT_SCALE,
  type Rig,
} from "./rigs";

export type CharacterHandle = {
  rig: Rig;
  body: ActorBody | undefined;
  name: string;
  root: Object3D;
  skinnedMeshes: readonly SkinnedMesh[];
  mixer: AnimationMixer;
  hips: Bone | undefined;
  rightHand: Bone | undefined;
  ownedMaterials: readonly Material[];
};

type Props = {
  look: CharacterLook;
  position: readonly [number, number, number];
  onReady?: (handle: CharacterHandle) => void;
};

export function instantiate(look: CharacterLook, loaded: LoadedLook): CharacterHandle {
  const name = loaded.body ?? look.rig;
  const root = cloneSkinned(loaded.source);
  root.scale.setScalar(MIXAMO_UNIT_SCALE * bodyScale(loaded.body, look.heightM));
  const ownedMaterials = ownMaterials(root);
  if (look.tint !== undefined) tintClothing(root, look.tint, ownedMaterials);
  root.traverse((object) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });
  const skinnedMeshes = findSkinnedMeshes(root);
  const mixerRoot = findPrimarySkinnedMesh(skinnedMeshes);
  if (!mixerRoot) throw new Error(`rig ${name} has no SkinnedMesh with a primary skeleton`);
  return {
    rig: look.rig,
    body: loaded.body,
    name,
    root,
    skinnedMeshes,
    mixer: new AnimationMixer(mixerRoot),
    hips: findHipBone(mixerRoot),
    rightHand: findRightHand(mixerRoot),
    ownedMaterials,
  };
}

export function useCharacter(look: CharacterLook): CharacterHandle | null {
  const [handle, setHandle] = useState<CharacterHandle | null>(null);
  const { rig, body, heightM, tint } = look;

  useEffect(() => {
    let cancelled = false;
    const wanted: CharacterLook = {
      rig,
      ...(body !== undefined ? { body } : {}),
      ...(heightM !== undefined ? { heightM } : {}),
      ...(tint !== undefined ? { tint } : {}),
    };
    loadLook(wanted)
      .then((loaded) => {
        if (!cancelled) setHandle(instantiate(wanted, loaded));
      })
      .catch((error: unknown) => {
        console.error(`character rig ${rig} failed to load`, error);
      });
    return () => {
      cancelled = true;
    };
  }, [rig, body, heightM, tint]);

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

export function Character({ look, position, onReady }: Props) {
  const handle = useCharacter(look);

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
