import { Mesh, type Material, type Object3D } from "three";

function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function eachMaterial(root: Object3D, visit: (material: Material) => void): void {
  root.traverse((object) => {
    if (object instanceof Mesh) materialsOf(object).forEach(visit);
  });
}

export function ownMaterials(root: Object3D): Material[] {
  const owned: Material[] = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const cloned = materialsOf(object).map((material) => material.clone());
    owned.push(...cloned);
    object.material = Array.isArray(object.material) ? cloned : (cloned[0] as Material);
  });
  return owned;
}

export function disposeMaterials(materials: readonly Material[]): void {
  materials.forEach((material) => material.dispose());
}

export function setOpacity(root: Object3D, opacity: number): void {
  const translucent = opacity < 1;
  eachMaterial(root, (material) => {
    if (material.transparent !== translucent) material.needsUpdate = true;
    material.transparent = translucent;
    material.opacity = opacity;
    material.depthWrite = !translucent;
  });
}

export function replaceMaterials(root: Object3D, material: Material): void {
  const replaced = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    materialsOf(object).forEach((previous) => {
      if (previous !== material) replaced.add(previous);
    });
    object.material = Array.isArray(object.material) ? object.material.map(() => material) : material;
    object.castShadow = false;
  });
  disposeMaterials([...replaced]);
}
