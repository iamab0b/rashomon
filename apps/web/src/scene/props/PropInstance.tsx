import type { ResolvedProp } from "@rashomon/engine";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group, Object3D } from "three";
import type { Anchor, SceneManifest } from "@rashomon/schema";
import { modelExists } from "../loaders/modelExists";
import { loadGlb } from "../loaders/scene";
import { useSceneStore } from "../store";
import { holderDrawn } from "./holder";
import { poseFromHand } from "./handAttach";
import { loadPropModel } from "./loadPropModel";
import { propPose } from "./propPose";
import { restBaseY } from "./restHeight";
import type { PropType } from "./types";
import { statusOf } from "../playback/useGraph";

const BOX_COLOR = "#8a8f98";
const BOX_EMISSIVE = "#2a2d33";

type Props = {
  prop: ResolvedProp;
  entry: PropType;
  anchor: Anchor | undefined;
  manifest: SceneManifest;
};

function useGlbModel(entry: PropType): Object3D | null {
  const [model, setModel] = useState<Object3D | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadPropModel(entry, modelExists, loadGlb)
      .then((seated) => {
        if (!cancelled) setModel(seated);
      })
      .catch((error: unknown) => console.error(`prop model ${entry.modelUrl} failed to load`, error));
    return () => {
      cancelled = true;
    };
  }, [entry]);
  return model;
}

export function PropInstance({ prop, entry, anchor, manifest }: Props) {
  const group = useRef<Group>(null);
  const model = useGlbModel(entry);
  const { l, w, h } = entry.dimensionsM;
  const baseY = useMemo(() => restBaseY(anchor, manifest, prop.position[1]), [anchor, manifest, prop.position]);

  useFrame(() => {
    const node = group.current;
    if (!node) return;
    const state = useSceneStore.getState();
    const pose = propPose(prop, state.t);
    const hand =
      pose.kind === "held" && state.resolved && holderDrawn(state.resolved, (e) => statusOf(state.statuses, e), pose.actor, state.t)
        ? state.characterHandles.get(pose.actor)?.rightHand
        : undefined;
    if (hand) {
      poseFromHand(hand, entry.gripOffset, node);
      return;
    }
    const position = pose.kind === "rest" ? pose.position : prop.position;
    node.position.set(position[0], baseY + h / 2, position[2]);
    node.quaternion.identity();
    node.scale.setScalar(1);
  });

  return (
    <group ref={group}>
      {model ? (
        <primitive object={model} />
      ) : (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, l]} />
          <meshStandardMaterial color={BOX_COLOR} emissive={BOX_EMISSIVE} />
        </mesh>
      )}
    </group>
  );
}

