import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { MeshBasicMaterial, Quaternion, Vector3, type Mesh } from "three";
import { currentPovRay } from "./povSightline";

const BLOCKED_COLOR = "#ff3b30";
const CLEAR_COLOR = "#34c759";
const RAY_RADIUS_M = 0.012;
const HIT_RADIUS_M = 0.08;
const RADIAL_SEGMENTS = 8;
const UP = new Vector3(0, 1, 0);

const from = new Vector3();
const to = new Vector3();
const delta = new Vector3();
const aim = new Quaternion();

export function PovRayLine() {
  const beam = useRef<Mesh>(null);
  const hit = useRef<Mesh>(null);

  useFrame(() => {
    const ray = currentPovRay();
    const node = beam.current;
    if (!node) return;
    node.visible = ray !== null;
    if (hit.current) hit.current.visible = ray?.blocked === true;
    if (!ray) return;
    from.set(...ray.from);
    to.set(...ray.to);
    delta.subVectors(to, from);
    const length = delta.length();
    node.visible = length > 0;
    node.position.copy(from).addScaledVector(delta, 0.5);
    node.quaternion.copy(aim.setFromUnitVectors(UP, delta.divideScalar(length || 1)));
    node.scale.set(1, length, 1);
    (node.material as MeshBasicMaterial).color.set(ray.blocked ? BLOCKED_COLOR : CLEAR_COLOR);
    hit.current?.position.copy(to);
  });

  return (
    <>
      <mesh ref={beam} visible={false}>
        <cylinderGeometry args={[RAY_RADIUS_M, RAY_RADIUS_M, 1, RADIAL_SEGMENTS]} />
        <meshBasicMaterial color={BLOCKED_COLOR} />
      </mesh>
      <mesh ref={hit} visible={false}>
        <sphereGeometry args={[HIT_RADIUS_M, 12, 8]} />
        <meshBasicMaterial color={BLOCKED_COLOR} />
      </mesh>
    </>
  );
}
