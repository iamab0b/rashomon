import type { Action, Flag, Override, Status } from "@rashomon/schema";

export type Vec3 = [number, number, number];

export type ResolvedEvent = {
  id: string;
  actor: string;
  action: Action;
  tStart: number;
  tEnd: number;
  status: Status;
  flags: Flag[];
  path: Vec3[];
  pathLengthM: number;
  reachable: boolean;
  from?: Vec3;
  to?: Vec3;
  at?: Vec3;
  facing?: Vec3;
  target?: string;
  prop?: string;
  sources: string[];
  override?: Override;
  supersededBy?: string;
  tInferred: boolean;
  handwritten?: boolean;
};

export type HeldInterval = { actor: string; tStart: number; tEnd: number };

export type ResolvedProp = {
  id: string;
  type: string;
  position: Vec3;
  heldBy?: string;
  heldByIntervals?: HeldInterval[];
  notes: string;
};

export type ResolvedGraph = {
  sceneId: string;
  version: number;
  durationS: number;
  actors: {
    id: string;
    label: string;
    role: string;
    rig: string;
    position?: Vec3;
  }[];
  events: ResolvedEvent[];
  props: ResolvedProp[];
  handwritten?: boolean;
};

export type GeomMesh = {
  id: string;
  positions: number[];
  indices: number[];
};

export type SceneGeom = { meshes: GeomMesh[] };

export type FlagDraft = Omit<Flag, "id">;

export type GateOutput = {
  statuses: Record<string, Status>;
  flags: Flag[];
};

export type { Flag };
