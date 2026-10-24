import { useFrame } from "@react-three/fiber";
import type { Landmark } from "@rashomon/schema";
import { Raycaster, Vector3, type Object3D } from "three";
import { CAMERA_PRESETS } from "../cameras/presets";
import { useSceneStore } from "../store";
import { labelAnchor } from "./anchors";
import { labelElements } from "./labelRegistry";

const LABEL_LIFT = 0.25;
const OCCLUSION_EPSILON = 0.05;
const projected = new Vector3();
const target = new Vector3();
const direction = new Vector3();
const raycaster = new Raycaster();

type Props = {
  landmarks: readonly Landmark[];
  occluders: Object3D;
};

export function LabelProjector({ landmarks, occluders }: Props) {
  useFrame(({ camera, size }) => {
    const elements = labelElements();
    const checkOcclusion = CAMERA_PRESETS[useSceneStore.getState().preset].isPov;
    for (const landmark of landmarks) {
      const element = elements.get(landmark.id);
      if (!element) continue;
      const [x, y, z] = labelAnchor(landmark);
      target.set(x, y + LABEL_LIFT, z);
      projected.copy(target).project(camera);
      let visible = projected.z > -1 && projected.z < 1;
      if (visible && checkOcclusion) {
        direction.copy(target).sub(camera.position);
        const distance = direction.length();
        raycaster.set(camera.position, direction.normalize());
        raycaster.far = distance - OCCLUSION_EPSILON;
        visible = raycaster.intersectObject(occluders, true).length === 0;
      }
      element.style.display = visible ? "block" : "none";
      if (!visible) continue;
      const px = ((projected.x + 1) / 2) * size.width;
      const py = ((1 - projected.y) / 2) * size.height;
      element.style.transform = `translate(${px}px, ${py}px) translate(-50%, -100%)`;
    }
  });
  return null;
}
