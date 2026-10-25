import type { Interior } from "@rashomon/schema";
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
  type Camera,
  type Object3D,
} from "three";
import type { Candidate } from "./candidates";
import { base64Bytes, MAX_IMAGE_BYTES } from "./payload";
import { CLIP_ABOVE_FLOOR_M, labelScale, VIEW_HEIGHT, VIEW_WIDTH, viewSpecs, type ViewSpec } from "./views";

export const JPEG_QUALITY = 0.8;
export const MIN_JPEG_QUALITY = 0.4;
export const LABEL_PIXELS = 40;
const BACKGROUND = "#1d2127";
const LABEL_CANVAS_WIDTH = 160;
const LABEL_CANVAS_HEIGHT = 80;
const DATA_URL_PREFIX = /^data:image\/jpeg;base64,/;

type Disposable = { dispose: () => void };

export function candidateColor(index: number): Color {
  return new Color().setHSL((index * 0.618034) % 1, 0.85, 0.55);
}

export function labelTexture(text: string, color: Color, doc: Document = document): CanvasTexture {
  const canvas = doc.createElement("canvas");
  canvas.width = LABEL_CANVAS_WIDTH;
  canvas.height = LABEL_CANVAS_HEIGHT;
  const context = canvas.getContext("2d");
  if (context) {
    context.font = "bold 56px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 10;
    context.strokeStyle = "#000000";
    context.strokeText(text, LABEL_CANVAS_WIDTH / 2, LABEL_CANVAS_HEIGHT / 2);
    context.fillStyle = `#${color.getHexString()}`;
    context.fillText(text, LABEL_CANVAS_WIDTH / 2, LABEL_CANVAS_HEIGHT / 2);
  }
  return new CanvasTexture(canvas);
}

function overlayFor(candidates: readonly Candidate[], view: ViewSpec, owned: Disposable[]): Scene {
  const overlay = new Scene();
  const height = labelScale(view, LABEL_PIXELS);
  candidates.forEach((candidate, index) => {
    const { min, max } = candidate.bounds;
    const color = candidateColor(index);
    const box = new BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const edges = new EdgesGeometry(box);
    box.dispose();
    const lineMaterial = new LineBasicMaterial({ color, depthTest: false, transparent: true });
    const lines = new LineSegments(edges, lineMaterial);
    lines.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    lines.renderOrder = 1;
    const texture = labelTexture(candidate.id, color);
    const spriteMaterial = new SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: view.kind === "top" });
    const sprite = new Sprite(spriteMaterial);
    sprite.scale.set((height * LABEL_CANVAS_WIDTH) / LABEL_CANVAS_HEIGHT, height, 1);
    sprite.position.set((min[0] + max[0]) / 2, view.kind === "top" ? max[1] : (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    sprite.renderOrder = 2;
    overlay.add(lines, sprite);
    owned.push(edges, lineMaterial, texture, spriteMaterial);
  });
  return overlay;
}

function cameraFor(view: ViewSpec): Camera {
  if (view.kind === "top") {
    const camera = new OrthographicCamera(-view.halfWidth, view.halfWidth, view.halfHeight, -view.halfHeight, 0.1, 100);
    camera.up.set(0, 0, -1);
    camera.position.set(...view.position);
    camera.lookAt(new Vector3(...view.target));
    return camera;
  }
  const camera = new PerspectiveCamera(view.fov, VIEW_WIDTH / VIEW_HEIGHT, 0.05, 100);
  camera.position.set(...view.position);
  camera.lookAt(new Vector3(...view.target));
  return camera;
}

export function encodeJpeg(canvas: HTMLCanvasElement): string {
  for (let quality = JPEG_QUALITY; quality >= MIN_JPEG_QUALITY - 1e-9; quality -= 0.1) {
    const data = canvas.toDataURL("image/jpeg", quality).replace(DATA_URL_PREFIX, "");
    if (base64Bytes(data) <= MAX_IMAGE_BYTES) return data;
  }
  throw new Error("a view did not fit the image size limit");
}

export function renderCandidateViews(model: Object3D, candidates: readonly Candidate[], interior: Interior, y0: number): string[] {
  const canvas = document.createElement("canvas");
  canvas.width = VIEW_WIDTH;
  canvas.height = VIEW_HEIGHT;
  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  const owned: Disposable[] = [];
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(VIEW_WIDTH, VIEW_HEIGHT, false);
    renderer.autoClear = false;
    renderer.setClearColor(new Color(BACKGROUND), 1);
    const room = new Scene();
    model.updateWorldMatrix(true, true);
    const copy = model.clone(true);
    model.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
    const sun = new DirectionalLight(0xffffff, 1.5);
    sun.position.set(interior.min[0], y0 + 10, interior.min[2]);
    room.add(copy, new AmbientLight(0xffffff, 1.5), sun);
    const clip = [new Plane(new Vector3(0, -1, 0), y0 + CLIP_ABOVE_FLOOR_M)];
    return viewSpecs(interior, y0).map((view) => {
      const camera = cameraFor(view);
      const overlay = overlayFor(candidates, view, owned);
      renderer.clear();
      renderer.clippingPlanes = clip;
      renderer.render(room, camera);
      renderer.clippingPlanes = [];
      renderer.render(overlay, camera);
      return encodeJpeg(canvas);
    });
  } finally {
    for (const resource of owned) resource.dispose();
    renderer.renderLists.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
