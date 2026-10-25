import type { Interior } from "@rashomon/schema";
import { BAND_TOP_M, type Vec3 } from "./candidates";

export const VIEW_WIDTH = 1024;
export const VIEW_HEIGHT = 768;
export const EYE_HEIGHT_M = 1.6;
export const CORNER_INSET_M = 0.3;
export const TOP_MARGIN_M = 0.5;
export const TOP_CAMERA_HEIGHT_M = 20;
export const EYE_FOV_DEG = 70;
export const CLIP_ABOVE_FLOOR_M = BAND_TOP_M + 0.1;

const ASPECT = VIEW_WIDTH / VIEW_HEIGHT;

export type TopView = {
  readonly kind: "top";
  readonly position: Vec3;
  readonly target: Vec3;
  readonly halfWidth: number;
  readonly halfHeight: number;
};

export type EyeView = { readonly kind: "eye"; readonly position: Vec3; readonly target: Vec3; readonly fov: number };

export type ViewSpec = TopView | EyeView;

export function viewSpecs(interior: Interior, y0: number): [TopView, EyeView, EyeView] {
  const [x0, , z0] = interior.min;
  const [x1, , z1] = interior.max;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const halfWidth = Math.max((x1 - x0) / 2 + TOP_MARGIN_M, ((z1 - z0) / 2 + TOP_MARGIN_M) * ASPECT);
  const insetX = Math.min(CORNER_INSET_M, (x1 - x0) / 4);
  const insetZ = Math.min(CORNER_INSET_M, (z1 - z0) / 4);
  const eye = y0 + EYE_HEIGHT_M;
  const target: Vec3 = [cx, y0 + EYE_HEIGHT_M / 2, cz];
  return [
    { kind: "top", position: [cx, y0 + TOP_CAMERA_HEIGHT_M, cz], target: [cx, y0, cz], halfWidth, halfHeight: halfWidth / ASPECT },
    { kind: "eye", position: [x0 + insetX, eye, z0 + insetZ], target, fov: EYE_FOV_DEG },
    { kind: "eye", position: [x1 - insetX, eye, z1 - insetZ], target, fov: EYE_FOV_DEG },
  ];
}

export function labelScale(view: ViewSpec, pixels: number): number {
  if (view.kind === "top") return (2 * view.halfHeight * pixels) / VIEW_HEIGHT;
  return (pixels / VIEW_HEIGHT) * 2 * Math.tan((view.fov * Math.PI) / 360);
}
