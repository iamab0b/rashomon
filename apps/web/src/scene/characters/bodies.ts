import { ACTOR_BODIES, type Actor, type ActorBody } from "@rashomon/schema";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import type { Group } from "three";
import { findPrimarySkinnedMesh, findSkinnedMeshes, loadRig, type Rig } from "./rigs";

export type BodySpec = {
  readonly file: string;
  readonly baseHeightM: number;
  readonly hipsHeightM: number;
};

export const BODY_SPECS: Readonly<Record<ActorBody, BodySpec>> = {
  slim_short: { file: "/characters/body_slim_short.fbx", baseHeightM: 1.65, hipsHeightM: 0.94 },
  slim_tall: { file: "/characters/body_slim_tall.fbx", baseHeightM: 1.85, hipsHeightM: 1.06 },
  average_short: { file: "/characters/body_average_short.fbx", baseHeightM: 1.65, hipsHeightM: 0.93 },
  average_tall: { file: "/characters/body_average_tall.fbx", baseHeightM: 1.85, hipsHeightM: 1.05 },
  heavy_short: { file: "/characters/body_heavy_short.fbx", baseHeightM: 1.65, hipsHeightM: 0.92 },
  heavy_tall: { file: "/characters/body_heavy_tall.fbx", baseHeightM: 1.85, hipsHeightM: 1.04 },
};

export const MIXAMO_CORE_BONES: readonly string[] = [
  "Hips",
  "Spine",
  "Spine1",
  "Spine2",
  "Neck",
  "Head",
  "HeadTop_End",
  ...["Left", "Right"].flatMap((side) => [
    `${side}Shoulder`,
    `${side}Arm`,
    `${side}ForeArm`,
    `${side}Hand`,
    `${side}UpLeg`,
    `${side}Leg`,
    `${side}Foot`,
    `${side}ToeBase`,
    `${side}Toe_End`,
  ]),
].map((name) => `mixamorig${name}`);

export type CharacterLook = {
  readonly rig: Rig;
  readonly body?: ActorBody;
  readonly heightM?: number;
  readonly tint?: string;
};

export type LoadedLook = {
  readonly source: Group;
  readonly body: ActorBody | undefined;
};

export type LookLoaders = {
  readonly loadRig: (rig: Rig) => Promise<Group>;
  readonly loadBody: (body: ActorBody) => Promise<Group>;
  readonly warn: (message: string, error?: unknown) => void;
};

export function isActorBody(value: string): value is ActorBody {
  return (ACTOR_BODIES as readonly string[]).includes(value);
}

export function actorLook(rig: Rig, actor: Actor | undefined): CharacterLook {
  return {
    rig,
    ...(actor?.body !== undefined ? { body: actor.body } : {}),
    ...(actor?.heightM !== undefined ? { heightM: actor.heightM } : {}),
    ...(actor?.tint !== undefined ? { tint: actor.tint } : {}),
  };
}

export function bodyScale(body: ActorBody | undefined, heightM: number | undefined): number {
  return body !== undefined && heightM !== undefined ? heightM / BODY_SPECS[body].baseHeightM : 1;
}

export function skeletonProblem(root: Group): string | null {
  const meshes = findSkinnedMeshes(root);
  if (meshes.length === 0) return "it has no skinned mesh and no skeleton";
  const primary = findPrimarySkinnedMesh(meshes);
  if (!primary) return "it has no primary skeleton";
  const names = new Set(primary.skeleton.bones.map((bone) => bone.name));
  const missing = MIXAMO_CORE_BONES.filter((name) => !names.has(name));
  if (missing.length > 0) return `its bone names do not match the Mixamo skeleton (missing ${missing.join(", ")})`;
  return null;
}

const bodyCache = new Map<ActorBody, Promise<Group>>();

export function loadBody(body: ActorBody): Promise<Group> {
  const cached = bodyCache.get(body);
  if (cached) return cached;
  const pending = new FBXLoader().loadAsync(BODY_SPECS[body].file);
  bodyCache.set(body, pending);
  pending.catch(() => bodyCache.delete(body));
  return pending;
}

const DEFAULT_LOADERS: LookLoaders = {
  loadRig,
  loadBody,
  warn: (message, error) => console.warn(message, ...(error === undefined ? [] : [error])),
};

export async function loadLook(look: CharacterLook, loaders: LookLoaders = DEFAULT_LOADERS): Promise<LoadedLook> {
  if (look.body !== undefined) {
    try {
      const source = await loaders.loadBody(look.body);
      const problem = skeletonProblem(source);
      if (problem === null) return { source, body: look.body };
      loaders.warn(`body ${look.body} refused: ${problem}; drawing rig ${look.rig} instead`);
    } catch (error: unknown) {
      loaders.warn(`body ${look.body} failed to load; drawing rig ${look.rig} instead`, error);
    }
  }
  return { source: await loaders.loadRig(look.rig), body: undefined };
}
