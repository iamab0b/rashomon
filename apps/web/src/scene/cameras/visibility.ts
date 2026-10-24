import { Box3, Frustum, Matrix4, Raycaster, Vector3, type Camera, type Object3D } from "three";

export const DIMMED_OPACITY = 0.25;
const OCCLUSION_EPSILON_M = 0.02;

const raycaster = new Raycaster();
const direction = new Vector3();
const projection = new Matrix4();

export function frustumOf(camera: Camera, target: Frustum = new Frustum()): Frustum {
  camera.updateMatrixWorld();
  projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  return target.setFromProjectionMatrix(projection);
}

function isPartOf(object: Object3D, owner: Object3D | null): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) if (node === owner) return true;
  return false;
}

export function isPointOccluded(
  eye: Vector3,
  point: Vector3,
  occluders: readonly Object3D[],
  owner: Object3D | null = null,
): boolean {
  direction.subVectors(point, eye);
  const distance = direction.length();
  if (distance <= OCCLUSION_EPSILON_M) return false;
  raycaster.set(eye, direction.divideScalar(distance));
  raycaster.near = 0;
  raycaster.far = distance - OCCLUSION_EPSILON_M;
  const hits = raycaster.intersectObjects(occluders as Object3D[], true);
  return hits.some((hit) => !isPartOf(hit.object, owner));
}

export function isPointVisible(
  eye: Vector3,
  point: Vector3,
  frustum: Frustum,
  occluders: readonly Object3D[],
  owner: Object3D | null = null,
): boolean {
  return frustum.containsPoint(point) && !isPointOccluded(eye, point, occluders, owner);
}

const bounds = new Box3();
const center = new Vector3();
const top = new Vector3();

export function isMeshVisible(eye: Vector3, mesh: Object3D, frustum: Frustum, occluders: readonly Object3D[]): boolean {
  bounds.setFromObject(mesh);
  if (bounds.isEmpty() || !frustum.intersectsBox(bounds)) return false;
  bounds.getCenter(center);
  top.set(center.x, bounds.max.y, center.z);
  return !isPointOccluded(eye, center, occluders, mesh) || !isPointOccluded(eye, top, occluders, mesh);
}
