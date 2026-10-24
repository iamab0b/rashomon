export type CameraPreset =
  | "overview"
  | "counter_close"
  | "witness_claimed"
  | "witness_corrected"
  | "rig_debug";

export type Vec3 = readonly [number, number, number];

export type CameraPose = {
  readonly position: Vec3;
  readonly lookAt: Vec3;
  readonly isPov: boolean;
};

export const CAMERA_PRESETS: Readonly<Record<CameraPreset, CameraPose>> = {
  overview: { position: [4.5, 7.5, 9.5], lookAt: [4.5, 0, 3.5], isPov: false },
  counter_close: { position: [5.5, 2.2, 1.0], lookAt: [8.0, 1.0, 2.5], isPov: false },
  witness_claimed: { position: [1.5, 1.6, 3.5], lookAt: [7.4, 1.2, 2.5], isPov: true },
  witness_corrected: { position: [4.5, 1.6, 1.0], lookAt: [7.4, 1.2, 2.5], isPov: true },
  rig_debug: { position: [4, 1.3, 7], lookAt: [4, 0.9, 3], isPov: false },
};

export const PRESET_KEYS: Readonly<Record<string, CameraPreset>> = {
  "1": "overview",
  "2": "counter_close",
  "3": "witness_claimed",
  "4": "witness_corrected",
};

export function isCameraPreset(value: string | null | undefined): value is CameraPreset {
  return value != null && Object.hasOwn(CAMERA_PRESETS, value);
}
