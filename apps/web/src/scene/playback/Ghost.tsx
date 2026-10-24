import type { ResolvedEvent } from "@rashomon/engine";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { MeshBasicMaterial, type Group } from "three";
import { IDLE_CLIP } from "../characters/actionMap";
import { useCharacter } from "../characters/Character";
import { getClip, loadClips } from "../characters/clips";
import { replaceMaterials } from "../characters/materials";
import type { Rig } from "../characters/rigs";
import { followedActorId } from "../cameras/povSightline";
import { useSceneStore } from "../store";
import { ghostAnchor, ghostVisible, ghostYaw, type PositionLookup } from "./actorPose";
import { HIDDEN_WITNESS_OPACITY } from "./witnessLayers";

const GHOST_COLOR = "#ff6b6b";
const GHOST_OPACITY = 0.6;
const BADGE_COLOR = "#ff3b30";
const BADGE_HEIGHT_M = 2.05;
const BADGE_RADIUS_M = 0.09;

type Props = {
  event: ResolvedEvent;
  rig: Rig;
  positionOf: PositionLookup;
  onReady: (id: string) => void;
  color?: string;
  badge?: boolean;
  shownAt?: (t: number) => boolean;
};

export function Ghost({ event, rig, positionOf, onReady, color = GHOST_COLOR, badge = true, shownAt }: Props) {
  const handle = useCharacter(rig);
  const group = useRef<Group>(null);
  const material = useMemo(
    () => new MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: GHOST_OPACITY, depthWrite: false }),
    [color],
  );

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    if (!handle) return;
    replaceMaterials(handle.root, material);
    let cancelled = false;
    loadClips()
      .then(() => {
        if (cancelled) return;
        const idle = getClip(IDLE_CLIP);
        if (idle) {
          const action = handle.mixer.clipAction(idle);
          action.play();
          action.time = 0;
          handle.mixer.update(0);
        }
        onReady(event.id);
      })
      .catch((error: unknown) => console.error("ghost pose failed", error));
    return () => {
      cancelled = true;
    };
  }, [handle, material, event.id, onReady]);

  useFrame(() => {
    const node = group.current;
    const anchor = ghostAnchor(event);
    if (!node || !anchor) return;
    const state = useSceneStore.getState();
    const { t } = state;
    node.visible = (shownAt ? shownAt(t) : ghostVisible(event, t)) && followedActorId(state) !== event.actor;
    if (!node.visible) return;
    material.opacity = state.hiddenWitnesses.has(event.witnessId) ? HIDDEN_WITNESS_OPACITY : GHOST_OPACITY;
    node.position.set(anchor[0], anchor[1], anchor[2]);
    node.rotation.set(0, ghostYaw(event, t, positionOf), 0);
  });

  if (!handle) return null;
  return (
    <group ref={group} visible={false}>
      <primitive object={handle.root} />
      {badge ? (
        <mesh position={[0, BADGE_HEIGHT_M, 0]}>
          <sphereGeometry args={[BADGE_RADIUS_M, 16, 12]} />
          <meshBasicMaterial color={BADGE_COLOR} />
        </mesh>
      ) : null}
    </group>
  );
}
