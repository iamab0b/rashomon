import type { Action, Flag, Status } from "@rashomon/schema";

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
  from?: Vec3;
  to?: Vec3;
  at?: Vec3;
  facing?: Vec3;
  target?: string;
  prop?: string;
  tInferred: boolean;
  handwritten?: boolean;
};

export type ResolvedProp = {
  id: string;
  type: string;
  position: Vec3;
  heldBy?: string;
  notes: string;
};

export type ResolvedGraph = {
  sceneId: string;
  version: number;
  durationS: number;
  actors: { id: string; label: string; role: string; rig: string }[];
  events: ResolvedEvent[];
  props: ResolvedProp[];
  handwritten?: boolean;
};

export type SceneGeometry = {
  sceneId: string;
  occluders: { id: string; min: Vec3; max: Vec3 }[];
};

export type GateVerdict = {
  eventId: string;
  status: Status;
  flags: Flag[];
};

export type GateResult = {
  verdicts: GateVerdict[];
  flags: Flag[];
};

export type { Flag };
