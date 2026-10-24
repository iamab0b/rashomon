import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef, type ComponentRef } from "react";
import { useSceneStore } from "../store";
import { CAMERA_PRESETS } from "./presets";

export function CameraRig() {
  const preset = useSceneStore((state) => state.preset);
  const poseResetCount = useSceneStore((state) => state.poseResetCount);
  const camera = useThree((state) => state.camera);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);

  useEffect(() => {
    const pose = CAMERA_PRESETS[preset];
    camera.position.set(...pose.position);
    camera.lookAt(...pose.lookAt);
    controls.current?.target.set(...pose.lookAt);
    controls.current?.update();
  }, [preset, poseResetCount, camera]);

  return <OrbitControls ref={controls} makeDefault />;
}
