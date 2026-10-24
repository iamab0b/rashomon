import type { Status } from "@rashomon/schema";

export type GeomMesh = {
  id: string;
  /** Flat x, y, z triples in meters. */
  positions: number[];
  /** Flat triangle vertex indices into `positions` / 3. */
  indices: number[];
};

export type SceneGeom = { meshes: GeomMesh[] };

export type FlagKind =
  | "sightline"
  | "reachability"
  | "time_distance"
  | "contradiction"
  | "unanchored"
  | "missing_time";

export type Flag = {
  kind: FlagKind;
  severity: "hard" | "soft";
  eventIds: string[];
  /** One sentence with the numbers that triggered the flag. */
  message: string;
};

export type GateOutput = {
  statuses: Record<string, Status>;
  flags: Flag[];
};

/** Mirrors `SceneManifest.portals` from the resolver PR, so this package does not depend on it landing first. */
export type Portals = {
  waypoints: { id: string; x: number; z: number }[];
  edges: [string, string][];
};
