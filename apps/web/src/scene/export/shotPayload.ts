import { POV_CAM, type CameraPreset } from "../cameras/presets";
import type { GraphSource } from "../playback/graphSource";

export type ShotPayload = {
  readonly fixture: string;
  readonly scenario?: string;
  readonly cam: string;
  readonly t: number;
  readonly mode?: "live";
};

export type ShotPayloadInput = {
  readonly search: string;
  readonly preset: CameraPreset;
  readonly following: boolean;
  readonly t: number;
};

export const SHOT_DISABLED_TOOLTIP = "Shots capture the URL's scenario; local edits are not included";

const DEFAULT_FIXTURE = "store";
const T_STEPS_PER_SECOND = 10;

export function buildShotPayload({ search, preset, following, t }: ShotPayloadInput): ShotPayload {
  const params = new URLSearchParams(search);
  const scenario = params.get("scenario");
  return {
    fixture: params.get("fixture") ?? DEFAULT_FIXTURE,
    ...(scenario ? { scenario } : {}),
    cam: following ? POV_CAM : preset,
    t: Math.round(t * T_STEPS_PER_SECOND) / T_STEPS_PER_SECOND,
    ...(params.get("mode") === "live" ? { mode: "live" as const } : {}),
  };
}

export function isShotDisabled(search: string, source: GraphSource | null): boolean {
  if (new URLSearchParams(search).get("mode") === "live") return true;
  if (!source) return false;
  return source.kind === "live" || ("edited" in source && source.edited === true);
}
