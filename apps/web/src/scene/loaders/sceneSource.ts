import type { SceneGeom } from "@rashomon/engine";
import type { SceneManifest } from "@rashomon/schema";
import type { Object3D } from "three";

export type SceneSource = {
  readonly kind: "fixture" | "scan";
  readonly manifest: SceneManifest;
  readonly model: Object3D;
  readonly geom: SceneGeom;
};
