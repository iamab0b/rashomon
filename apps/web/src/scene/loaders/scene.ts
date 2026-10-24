import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { SceneManifest } from "@rashomon/schema";
import { storeScene } from "@rashomon/schema/fixtures";
import { ownMaterials } from "../characters/materials";

export type LoadedScene = {
  manifest: SceneManifest;
  model: Object3D;
  isPlaceholder: boolean;
};

const DRESS_PREFIX = "dress_";
const FIXTURES: Readonly<Record<string, SceneManifest>> = {
  store: storeScene,
};

export function isKnownFixture(fixture: string): boolean {
  return Object.hasOwn(FIXTURES, fixture);
}

export function loadManifest(fixture: string): SceneManifest {
  const manifest = Object.hasOwn(FIXTURES, fixture) ? FIXTURES[fixture] : undefined;
  if (!manifest) throw new Error(`unknown scene fixture "${fixture}"`);
  return manifest;
}

export function tagCollision(root: Object3D): void {
  root.traverse((object) => {
    if (object.name.startsWith(DRESS_PREFIX)) object.userData.collision = false;
  });
}

function enableShadows(root: Object3D): void {
  root.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
}

export function buildPlaceholder(manifest: SceneManifest): Group {
  const group = new Group();
  group.name = "placeholder_scene";

  const interior = manifest.interior;
  if (interior) {
    const width = interior.max[0] - interior.min[0];
    const depth = interior.max[2] - interior.min[2];
    const floor = new Mesh(
      new PlaneGeometry(width, depth),
      new MeshStandardMaterial({ color: new Color("#2a3039") }),
    );
    floor.name = "floor";
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(interior.min[0] + width / 2, interior.min[1], interior.min[2] + depth / 2);
    group.add(floor);
  }

  for (const landmark of manifest.landmarks) {
    if (!landmark.occludes) continue;
    const { min, max } = landmark.bounds;
    const box = new Mesh(
      new BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]),
      new MeshStandardMaterial({ color: new Color("#6b7686") }),
    );
    box.name = landmark.id;
    box.position.set(
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    );
    group.add(box);
  }

  return group;
}

async function loadGlb(url: string): Promise<Object3D> {
  const gltf = await new GLTFLoader().loadAsync(url);
  return gltf.scene;
}

export async function loadScene(fixture: string): Promise<LoadedScene> {
  const manifest = loadManifest(fixture);
  try {
    const model = await loadGlb(manifest.meshUrl);
    tagCollision(model);
    enableShadows(model);
    ownMaterials(model);
    return { manifest, model, isPlaceholder: false };
  } catch (error) {
    console.warn(
      `scene mesh ${manifest.meshUrl} failed to load, using placeholder built from landmark bounds`,
      error,
    );
    const model = buildPlaceholder(manifest);
    tagCollision(model);
    enableShadows(model);
    ownMaterials(model);
    return { manifest, model, isPlaceholder: true };
  }
}
