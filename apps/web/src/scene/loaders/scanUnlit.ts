import { Mesh, MeshBasicMaterial, type Material, type Object3D } from "three";

export const SCAN_LIT_PARAM = "scanlit";

export function scanLitFromSearch(search: string): boolean {
  return new URLSearchParams(search).get(SCAN_LIT_PARAM) === "1";
}

function unlitCopy(source: Material): MeshBasicMaterial {
  const basic = new MeshBasicMaterial();
  const from = source as Material & Partial<Pick<MeshBasicMaterial, "map" | "color" | "alphaMap">>;
  basic.name = source.name;
  basic.map = from.map ?? null;
  basic.alphaMap = from.alphaMap ?? null;
  if (from.color) basic.color.copy(from.color);
  basic.vertexColors = source.vertexColors;
  basic.side = source.side;
  basic.transparent = source.transparent;
  basic.opacity = source.opacity;
  basic.alphaTest = source.alphaTest;
  basic.depthWrite = source.depthWrite;
  basic.depthTest = source.depthTest;
  basic.visible = source.visible;
  return basic;
}

export function makeScanUnlit(root: Object3D): void {
  const converted = new Map<Material, MeshBasicMaterial>();
  const convert = (material: Material): MeshBasicMaterial => {
    let basic = converted.get(material);
    if (!basic) {
      basic = unlitCopy(material);
      converted.set(material, basic);
    }
    return basic;
  };
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
    object.castShadow = false;
    object.receiveShadow = false;
  });
  converted.forEach((_, previous) => previous.dispose());
}
