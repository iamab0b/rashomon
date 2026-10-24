import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";

export type Origin = "corner" | "center";

export function boxModel(width: number, height: number, depth: number, origin: Origin): Group {
  const geometry = new BoxGeometry(width, height, depth);
  if (origin === "corner") geometry.translate(width / 2, height / 2, -depth / 2);
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  mesh.name = "body";
  const root = new Group();
  root.name = "model";
  root.add(mesh);
  return root;
}
