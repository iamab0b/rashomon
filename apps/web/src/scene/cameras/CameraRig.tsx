import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type ComponentRef } from "react";
import { useSceneStore } from "../store";
import { getPovSightline } from "./povSightline";
import { CAMERA_PRESETS } from "./presets";

export const FOLLOW_PRIORITY = -1;

export function CameraRig() {
  const preset = useSceneStore((state) => state.preset);
  const poseResetCount = useSceneStore((state) => state.poseResetCount);
  const following = useSceneStore((state) => state.povFollow);
  const camera = useThree((state) => state.camera);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);

  useEffect(() => {
    if (following) return;
    const pose = CAMERA_PRESETS[preset];
    camera.position.set(...pose.position);
    camera.lookAt(...pose.lookAt);
    controls.current?.target.set(...pose.lookAt);
    controls.current?.update();
  }, [preset, poseResetCount, following, camera]);

  useFrame(() => {
    if (!useSceneStore.getState().povFollow) return;
    const sightline = getPovSightline();
    if (!sightline) return;
    camera.position.set(...sightline.eye);
    camera.lookAt(...sightline.target);
    camera.updateMatrixWorld();
  }, FOLLOW_PRIORITY);

  return <OrbitControls ref={controls} makeDefault enabled={!following} />;
}
