import { Mesh, type Material, type Object3D } from "three";

function eachMaterial(root: Object3D, visit: (material: Material) => void): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(visit);
  });
}

export function ownMaterials(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((material: Material) => material.clone())
      : (object.material as Material).clone();
  });
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
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.material = Array.isArray(object.material) ? object.material.map(() => material) : material;
    object.castShadow = false;
  });
}
