import { Mesh, Plane, Vector3, type Material, type Object3D } from "three";
import type { SceneGeom } from "@rashomon/engine";
import { boundsOf } from "./alignment";

export const CEILING_CUT_HEIGHT_M = 2.3;

export function ceilingCutActive(cameraY: number, floorY: number): boolean {
  return cameraY > floorY + CEILING_CUT_HEIGHT_M;
}

export function ceilingCutPlane(floorY: number): Plane {
  return new Plane(new Vector3(0, -1, 0), floorY + CEILING_CUT_HEIGHT_M);
}

export function scanFloorY(aligned: boolean, geom: SceneGeom): number {
  if (aligned) return 0;
  return boundsOf(geom.meshes.map((mesh) => mesh.positions))?.min[1] ?? 0;
}

export function scanMaterials(raw: Object3D): Material[] {
  const found = new Set<Material>();
  raw.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => found.add(material));
  });
  return [...found];
}

export type CeilingCut = {
  readonly set: (active: boolean) => boolean;
};

export function createCeilingCut(raw: Object3D, floorY: number): CeilingCut {
  const materials = scanMaterials(raw);
  const planes = [ceilingCutPlane(floorY)];
  const none: Plane[] = [];
  let current: boolean | null = null;
  return {
    set(active) {
      if (current === active) return false;
      current = active;
      const next = active ? planes : none;
      materials.forEach((material) => {
        material.clippingPlanes = next;
      });
      return true;
    },
  };
}
