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
  reachable: boolean;
  from?: Vec3;
  to?: Vec3;
  at?: Vec3;
  facing?: Vec3;
  target?: string;
  prop?: string;
  /** First source segment id of the event; undefined when it has none. */
  segmentId?: string;
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
  /** Flat x, y, z triples in meters. */
  positions: number[];
  /** Flat triangle vertex indices into `positions` / 3. */
  indices: number[];
};

export type SceneGeom = { meshes: GeomMesh[] };

export type GateFlagKind =
  | "sightline"
  | "reachability"
  | "time_distance"
  | "contradiction"
  | "unanchored"
  | "missing_time";

/** A gate finding. Named GateFlag because `Flag` is already the schema's per-event flag. */
export type GateFlag = {
  kind: GateFlagKind;
  severity: "hard" | "soft";
  eventIds: string[];
  /** One sentence with the numbers that triggered the flag. */
  message: string;
};

export type GateOutput = {
  statuses: Record<string, Status>;
  flags: GateFlag[];
};

export type { Flag };
