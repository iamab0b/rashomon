import { Color, Mesh, type BufferAttribute, type Material, type Object3D } from "three";

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

const SKIN_NAME = /skin|body/i;
const SKIN_HUE_MAX = 50 / 360;
const SKIN_SATURATION: readonly [number, number] = [0.15, 0.75];
const SKIN_LIGHTNESS: readonly [number, number] = [0.2, 0.85];

type Colored = Material & { color: Color };

function isColored(material: Material): material is Colored {
  return "color" in material && material.color instanceof Color;
}

function isSkinTone(color: Color): boolean {
  const { h, s, l } = color.getHSL({ h: 0, s: 0, l: 0 });
  return (
    h <= SKIN_HUE_MAX &&
    s >= SKIN_SATURATION[0] &&
    s <= SKIN_SATURATION[1] &&
    l >= SKIN_LIGHTNESS[0] &&
    l <= SKIN_LIGHTNESS[1]
  );
}

function vertexRanges(mesh: Mesh): { material: Material; start: number; count: number }[] {
  const geometry = mesh.geometry;
  const total = geometry.index ? geometry.index.count : (geometry.getAttribute("position")?.count ?? 0);
  if (!Array.isArray(mesh.material)) return [{ material: mesh.material, start: 0, count: total }];
  const materials = mesh.material;
  if (geometry.groups.length === 0) return materials[0] ? [{ material: materials[0], start: 0, count: total }] : [];
  return geometry.groups.flatMap((group) => {
    const material = materials[group.materialIndex ?? 0];
    return material ? [{ material, start: group.start, count: Math.min(group.count, total - group.start) }] : [];
  });
}

function skinVertexCount(mesh: Mesh, material: Material, start: number, count: number): number {
  const colors = mesh.geometry.getAttribute("color") as BufferAttribute | undefined;
  if (!colors) return isColored(material) && isSkinTone(material.color) ? count : 0;
  const index = mesh.geometry.index;
  const color = new Color();
  let skin = 0;
  for (let i = start; i < start + count; i++) {
    const vertex = index ? index.getX(i) : i;
    color.setRGB(colors.getX(vertex), colors.getY(vertex), colors.getZ(vertex));
    if (isColored(material)) color.multiply(material.color);
    if (isSkinTone(color)) skin += 1;
  }
  return skin;
}

function materialKey(material: Material): Material | string {
  return material.name === "" ? material : material.name;
}

export function findSkinMaterials(root: Object3D): ReadonlySet<Material> {
  const named = new Set<Material>();
  const byKey = new Map<Material | string, Material[]>();
  const skinVertices = new Map<Material | string, number>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const { material, start, count } of vertexRanges(object)) {
      if (SKIN_NAME.test(material.name)) named.add(material);
      const key = materialKey(material);
      const group = byKey.get(key) ?? [];
      if (!group.includes(material)) group.push(material);
      byKey.set(key, group);
      skinVertices.set(key, (skinVertices.get(key) ?? 0) + skinVertexCount(object, material, start, count));
    }
  });
  if (named.size > 0) return named;
  let skin: Material | string | undefined;
  let most = 0;
  for (const [key, vertices] of skinVertices) {
    if (vertices > most) {
      most = vertices;
      skin = key;
    }
  }
  return new Set(skin === undefined ? [] : byKey.get(skin));
}

export function tintClothing(root: Object3D, tint: string, owned: readonly Material[]): Material[] {
  const ownedSet = new Set(owned);
  const all = new Set<Material>();
  eachMaterial(root, (material) => {
    if (ownedSet.has(material) && isColored(material)) all.add(material);
  });
  const skin = findSkinMaterials(root);
  const clothing = [...all].filter((material) => !skin.has(material));
  const tinted = skin.size === 0 || clothing.length === 0 ? [...all] : clothing;
  const factor = new Color(tint);
  for (const material of tinted) (material as Colored).color.multiply(factor);
  return tinted;
}
