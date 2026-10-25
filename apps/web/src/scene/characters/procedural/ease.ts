import { TIMELINE_START_S } from "../blend";

export const EDGE_EASE_S = 0.3;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function smoothstep01(value: number): number {
  const k = clamp01(value);
  return k * k * (3 - 2 * k);
}

export function edgeWeight(tStart: number, tEnd: number, t: number, easeS: number = EDGE_EASE_S): number {
  if (t < tStart || t > tEnd) return 0;
  const easeIn = tStart <= TIMELINE_START_S ? 1 : smoothstep01((t - tStart) / easeS);
  const easeOut = smoothstep01((tEnd - t) / easeS);
  return Math.min(easeIn, easeOut);
}

export function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function clampAbs(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}
