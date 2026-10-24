import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Group } from "three";
import { AnimatedCharacter } from "../characters/AnimatedCharacter";
import type { CharacterHandle } from "../characters/Character";
import { setOpacity } from "../characters/materials";
import type { Rig } from "../characters/rigs";
import { followedActorId } from "../cameras/povSightline";
import { DIMMED_OPACITY } from "../cameras/visibility";
import { useSceneStore } from "../store";
import { actorPosition, actorStatus, actorYaw, type ActorPlayback, type PositionLookup } from "./actorPose";
import { rigOpacity } from "./witnessLayers";

export const PROPOSED_OPACITY = 0.4;
const ORIGIN = [0, 0, 0] as const;

type Props = {
  playback: ActorPlayback;
  rig: Rig;
  positionOf: PositionLookup;
  onReady: (id: string) => void;
};

export function ActorRig({ playback, rig, positionOf, onReady }: Props) {
  const group = useRef<Group>(null);
  const [handle, setHandle] = useState<CharacterHandle | null>(null);
  const appliedOpacity = useRef(1);

  const handleReady = useCallback(
    (ready: CharacterHandle) => {
      setHandle(ready);
      onReady(playback.actorId);
    },
    [onReady, playback.actorId],
  );

  useEffect(() => {
    if (!handle) return;
    const { setCharacterHandle } = useSceneStore.getState();
    setCharacterHandle(playback.actorId, handle);
    return () => {
      if (useSceneStore.getState().characterHandles.get(playback.actorId) === handle) setCharacterHandle(playback.actorId, null);
    };
  }, [handle, playback.actorId]);

  useFrame(() => {
    const node = group.current;
    if (!node) return;
    const state = useSceneStore.getState();
    const { t } = state;
    const position = actorPosition(playback, t);
    node.visible = position !== null && followedActorId(state) !== playback.actorId;
    if (!position) return;
    node.position.set(position[0], position[1], position[2]);
    node.rotation.set(0, actorYaw(playback, t, positionOf), 0);
    const statusOpacity = actorStatus(playback, t) === "proposed" ? PROPOSED_OPACITY : 1;
    const dimmed = state.dimmedActors.has(playback.actorId) ? Math.min(statusOpacity, DIMMED_OPACITY) : statusOpacity;
    const opacity = rigOpacity(playback, t, dimmed, state.hiddenWitnesses);
    if (handle && opacity !== appliedOpacity.current) {
      setOpacity(handle.root, opacity);
      appliedOpacity.current = opacity;
    }
  });

  return (
    <group ref={group}>
      <AnimatedCharacter actorId={playback.actorId} rig={rig} position={ORIGIN} onReady={handleReady} />
    </group>
  );
}
