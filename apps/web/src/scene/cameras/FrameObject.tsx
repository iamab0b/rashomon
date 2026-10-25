import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { Box3, PerspectiveCamera, type Object3D } from "three";
import { framePose } from "./framing";

type Controls = { target: { set: (x: number, y: number, z: number) => void }; update: () => void };

export function FrameObject({ object, frameKey }: { object: Object3D; frameKey: number }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as Controls | null;
  useEffect(() => {
    if (frameKey === 0 || !(camera instanceof PerspectiveCamera)) return;
    const box = new Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const pose = framePose({ min: box.min.toArray(), max: box.max.toArray() }, camera.fov);
    camera.far = pose.far;
    camera.updateProjectionMatrix();
    camera.position.set(...pose.position);
    camera.lookAt(...pose.lookAt);
    controls?.target.set(...pose.lookAt);
    controls?.update();
  }, [object, frameKey, camera, controls]);
  return null;
}
