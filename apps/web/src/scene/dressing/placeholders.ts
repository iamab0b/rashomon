import type { Object3D } from "three";

export function hidePlaceholderBoxes(root: Object3D, landmarkIds: Iterable<string>): () => void {
  const hidden: Object3D[] = [];
  for (const id of landmarkIds) {
    const box = root.getObjectByName(id);
    if (!box || !box.visible) continue;
    box.visible = false;
    hidden.push(box);
  }
  return () => {
    for (const box of hidden) box.visible = true;
  };
}
