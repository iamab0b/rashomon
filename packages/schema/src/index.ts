export type Landmark = {
  id: string;
  label: string;
  aliases: string[];
  position: [number, number, number];
  bounds: { min: [number, number, number]; max: [number, number, number] };
  kind: "door" | "window" | "furniture" | "appliance" | "zone" | "prop_spawn";
  occludes: boolean;
};

export type Portals = {
  waypoints: { id: string; x: number; z: number }[];
  edges: [string, string][];
};

export type Interior = {
  min: [number, number, number];
  max: [number, number, number];
};

export type SceneManifest = {
  sceneId: string;
  meshUrl: string;
  navmeshUrl?: string;
  up: "y";
  unitsPerMeter: 1;
  eyeHeight: 1.6;
  landmarks: Landmark[];
  interior?: Interior;
  portals?: Portals;
};

export type Segment = {
  id: string;
  sessionId: string;
  witnessId: string;
  speaker: "witness" | "interviewer" | "agent";
  text: string;
  t: [number, number];
  source: "live" | "copilot" | "upload_audio" | "upload_text";
  supersedes?: string;
};

export type ActorBody =
  | "slim_short"
  | "slim_tall"
  | "average_short"
  | "average_tall"
  | "heavy_short"
  | "heavy_tall";

export const ACTOR_BODIES: readonly ActorBody[] = [
  "slim_short",
  "slim_tall",
  "average_short",
  "average_tall",
  "heavy_short",
  "heavy_tall",
];

export const MIN_HEIGHT_M = 1.4;
export const MAX_HEIGHT_M = 2.1;
export const TINT_PATTERN = /^#[0-9a-f]{6}$/;

export type Actor = {
  id: string;
  label: string;
  role: "witness" | "suspect" | "victim" | "other";
  rig: "mixamo_ybot" | "mixamo_xbot";
  body?: ActorBody;
  heightM?: number;
  tint?: string;
};

export type Anchor =
  | { kind: "at"; landmark: string }
  | { kind: "near"; landmark: string; radiusM?: number }
  | { kind: "behind"; landmark: string }
  | { kind: "between"; a: string; b: string }
  | { kind: "xyz"; position: [number, number, number] };

export type Action =
  | "stand"
  | "walk"
  | "run"
  | "crouch"
  | "fall"
  | "shove"
  | "punch"
  | "pick_up"
  | "drop"
  | "throw"
  | "open_door"
  | "look"
  | "speak"
  | "hands_up"
  | "point"
  | "reach"
  | "kneel"
  | "stumble"
  | "jump"
  | "phone"
  | "drink"
  | "dodge";

export const ACTIONS: readonly Action[] = [
  "stand",
  "walk",
  "run",
  "crouch",
  "fall",
  "shove",
  "punch",
  "pick_up",
  "drop",
  "throw",
  "open_door",
  "look",
  "speak",
  "hands_up",
  "point",
  "reach",
  "kneel",
  "stumble",
  "jump",
  "phone",
  "drink",
  "dodge",
];

export type ActionStyle = "sneak" | "scared" | "forward" | "outward" | "behind";

export const STYLE_ACTION: Readonly<Record<ActionStyle, Action>> = {
  sneak: "walk",
  scared: "run",
  forward: "fall",
  outward: "open_door",
  behind: "look",
};

export const ACTION_STYLES: readonly ActionStyle[] = [
  "sneak",
  "scared",
  "forward",
  "outward",
  "behind",
];

export const MAX_VERB_CHARS = 40;

export type Status =
  | "proposed"
  | "plausible"
  | "implausible"
  | "overridden"
  | "superseded";

export type Flag = {
  id: string;
  eventId: string;
  check:
    | "sightline"
    | "reachability"
    | "time_distance"
    | "contradiction"
    | "unanchored"
    | "missing_time";
  severity: "hard" | "soft";
  detail: string;
  evidence: Record<string, number | string>;
  conflictsWith?: string[];
  suggestedQuestion: string;
};

export type Override = {
  by: string;
  reason: string;
  at: number;
  flagIds: string[];
};

export type Event = {
  id: string;
  witnessId: string;
  actor: string;
  action: Action;
  from?: Anchor;
  to?: Anchor;
  at?: Anchor;
  facing?: string;
  target?: string;
  prop?: string;
  style?: ActionStyle;
  actionApproximated?: boolean;
  verb?: string;
  t: [number, number];
  tConfidence: "stated" | "inferred";
  confidence: number;
  sources: string[];
  status: Status;
  flags: Flag[];
  override?: Override;
  supersededBy?: string;
};

export type PropInstance = {
  id: string;
  type: string;
  anchor: Anchor;
  heldBy?: string;
  notes: string;
  sources: string[];
};

export type Witness = {
  id: string;
  label: string;
  actorId?: string;
};

export type EventGraph = {
  sceneId: string;
  actors: Actor[];
  events: Event[];
  props: PropInstance[];
  witnesses?: Witness[];
  version: number;
};

export type Patch =
  | { op: "add_event"; event: Omit<Event, "id" | "status" | "flags"> & { id?: string } }
  | { op: "update_event"; id: string; changes: Partial<Event>; sources: string[] }
  | { op: "retract_event"; id: string; sources: string[] }
  | { op: "add_prop"; prop: Omit<PropInstance, "id"> & { id?: string } }
  | { op: "update_prop"; id: string; changes: Partial<PropInstance>; sources: string[] }
  | { op: "add_actor"; actor: Actor }
  | { op: "override"; id: string; reason: string; by: string };

export type PropType = {
  type: string;
  label: string;
  aliases: string[];
  modelUrl: string;
  dimensionsM: { l: number; w: number; h: number };
  massKg: number;
  graspable: boolean;
  defaultNotes: string;
  source: string;
};
