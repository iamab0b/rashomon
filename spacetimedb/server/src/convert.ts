import { SenderError } from "spacetimedb/server";
import { ACTIONS, ACTION_STYLES, MAX_VERB_CHARS, STYLE_ACTION } from "@rashomon/schema";
import type { ActionStyle, Anchor, Event, EventGraph, Flag, Override, PropInstance, Status } from "@rashomon/schema";

export const SPEAKERS = ["witness", "interviewer", "agent"] as const;
export const SEGMENT_SOURCES = ["live", "copilot", "upload_audio", "upload_text"] as const;
export const ROLES = ["witness", "suspect", "victim", "other"] as const;
export const RIGS = ["mixamo_ybot", "mixamo_xbot"] as const;
export const STATUSES: readonly Status[] = [
  "proposed",
  "plausible",
  "implausible",
  "overridden",
  "superseded",
];
export const CHECKS = [
  "sightline",
  "reachability",
  "time_distance",
  "contradiction",
  "unanchored",
  "missing_time",
] as const;
export const CONFIDENCES: readonly number[] = [0.3, 0.6, 0.9];
export const MIN_OVERRIDE_REASON_CHARS = 10;

export type AnchorRow = {
  kind: string;
  landmark: string | undefined;
  radiusM: number | undefined;
  a: string | undefined;
  b: string | undefined;
  position: number[] | undefined;
};

export const fail = (message: string): never => {
  throw new SenderError(message);
};

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T))
    return fail(`${what} must be one of ${allowed.join(", ")}`);
  return value as T;
}

export function nonEmptyString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") return fail(`${what} must be a non-empty string`);
  return value;
}

export function idOf(value: unknown, what: string): string {
  const id = nonEmptyString(value, what);
  if (id.includes("/")) return fail(`${what} must not contain "/"`);
  return id;
}

export function optionalId(value: unknown, what: string): string | undefined {
  if (value === undefined) return undefined;
  return idOf(value, what);
}

export function confidenceOf(value: unknown, what: string): number {
  if (typeof value !== "number" || !CONFIDENCES.includes(value)) return fail(`${what} must be one of ${CONFIDENCES.join(", ")}`);
  return value;
}

export function optionalString(value: unknown, what: string): string | undefined {
  if (value === undefined) return undefined;
  return nonEmptyString(value, what);
}

export function sourcesOf(value: unknown, what: string): string[] {
  if (!Array.isArray(value) || value.length === 0) return fail(`${what} sources must be a non-empty array`);
  return value.map((s) => nonEmptyString(s, `${what} source`));
}

export function intervalOf(value: unknown, what: string): [number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((n) => typeof n === "number" && Number.isFinite(n))
  )
    return fail(`${what} must be a [start, end] pair of seconds`);
  const [start, end] = value as [number, number];
  if (start > end) return fail(`${what} start ${start} is after its end ${end}`);
  return [start, end];
}

export function anchorFrom(value: unknown, what: string): Anchor {
  if (!isRecord(value)) return fail(`${what} must be an anchor`);
  switch (value.kind) {
    case "at":
      return { kind: "at", landmark: nonEmptyString(value.landmark, `${what}.landmark`) };
    case "behind":
      return { kind: "behind", landmark: nonEmptyString(value.landmark, `${what}.landmark`) };
    case "near": {
      const radius = value.radiusM;
      if (radius !== undefined && (typeof radius !== "number" || !(radius > 0)))
        return fail(`${what}.radiusM must be a positive number`);
      return {
        kind: "near",
        landmark: nonEmptyString(value.landmark, `${what}.landmark`),
        ...(radius !== undefined ? { radiusM: radius } : {}),
      };
    }
    case "between":
      return {
        kind: "between",
        a: nonEmptyString(value.a, `${what}.a`),
        b: nonEmptyString(value.b, `${what}.b`),
      };
    case "xyz": {
      const p = value.position;
      if (!Array.isArray(p) || p.length !== 3 || !p.every((n) => typeof n === "number" && Number.isFinite(n)))
        return fail(`${what}.position must be three numbers`);
      return { kind: "xyz", position: p as [number, number, number] };
    }
    default:
      return fail(`${what}.kind must be at, near, behind, between or xyz`);
  }
}

export function toAnchorRow(a: Anchor): AnchorRow {
  const row: AnchorRow = {
    kind: a.kind,
    landmark: undefined,
    radiusM: undefined,
    a: undefined,
    b: undefined,
    position: undefined,
  };
  if (a.kind === "at" || a.kind === "behind") row.landmark = a.landmark;
  else if (a.kind === "near") {
    row.landmark = a.landmark;
    row.radiusM = a.radiusM;
  } else if (a.kind === "between") {
    row.a = a.a;
    row.b = a.b;
  } else row.position = [...a.position];
  return row;
}

export function fromAnchorRow(r: AnchorRow): Anchor {
  if (r.kind === "at") return { kind: "at", landmark: r.landmark! };
  if (r.kind === "behind") return { kind: "behind", landmark: r.landmark! };
  if (r.kind === "near")
    return { kind: "near", landmark: r.landmark!, ...(r.radiusM !== undefined ? { radiusM: r.radiusM } : {}) };
  if (r.kind === "between") return { kind: "between", a: r.a!, b: r.b! };
  return { kind: "xyz", position: r.position as [number, number, number] };
}

export type EventFields = {
  witnessId: string;
  actor: string;
  action: Event["action"];
  fromAnchor: AnchorRow | undefined;
  toAnchor: AnchorRow | undefined;
  atAnchor: AnchorRow | undefined;
  facing: string | undefined;
  target: string | undefined;
  prop: string | undefined;
  tStart: number;
  tEnd: number;
  tConfidence: "stated" | "inferred";
  confidence: number;
  sources: string[];
  supersededBy: string | undefined;
  style: ActionStyle | undefined;
  actionApproximated: boolean | undefined;
  verb: string | undefined;
};

export function optionalBoolean(value: unknown, what: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") return fail(`${what} must be true or false`);
  return value;
}

export function optionalVerb(value: unknown, what: string): string | undefined {
  const verb = optionalString(value, what);
  if (verb !== undefined && verb.length > MAX_VERB_CHARS) return fail(`${what} must be at most ${MAX_VERB_CHARS} characters`);
  return verb;
}

export function optionalStyle(value: unknown, what: string): ActionStyle | undefined {
  return value === undefined ? undefined : oneOf(value, ACTION_STYLES, what);
}

export function styleFits(style: string | undefined, action: string): boolean {
  return style === undefined || STYLE_ACTION[style as ActionStyle] === action;
}

const optionalAnchorRow = (value: unknown, what: string): AnchorRow | undefined =>
  value === undefined ? undefined : toAnchorRow(anchorFrom(value, what));

export function eventFieldsFrom(value: unknown): EventFields {
  if (!isRecord(value)) return fail("event must be an object");
  const [tStart, tEnd] = intervalOf(value.t, "event.t");
  return {
    witnessId: nonEmptyString(value.witnessId, "event.witnessId"),
    actor: nonEmptyString(value.actor, "event.actor"),
    action: oneOf(value.action, ACTIONS, "event.action"),
    fromAnchor: optionalAnchorRow(value.from, "event.from"),
    toAnchor: optionalAnchorRow(value.to, "event.to"),
    atAnchor: optionalAnchorRow(value.at, "event.at"),
    facing: optionalString(value.facing, "event.facing"),
    target: optionalString(value.target, "event.target"),
    prop: optionalString(value.prop, "event.prop"),
    tStart,
    tEnd,
    tConfidence: oneOf(value.tConfidence, ["stated", "inferred"] as const, "event.tConfidence"),
    confidence: confidenceOf(value.confidence, "event.confidence"),
    sources: sourcesOf(value.sources, "event"),
    supersededBy: optionalString(value.supersededBy, "event.supersededBy"),
    style: optionalStyle(value.style, "event.style"),
    actionApproximated: optionalBoolean(value.actionApproximated, "event.actionApproximated"),
    verb: optionalVerb(value.verb, "event.verb"),
  };
}

export function checkStyleFits(style: string | undefined, action: string, what: string): void {
  if (!styleFits(style, action)) fail(`${what} ${style} goes with ${STYLE_ACTION[style as ActionStyle]}, not ${action}`);
}

const EVENT_CHANGE_KEYS = new Set([
  "witnessId",
  "actor",
  "action",
  "from",
  "to",
  "at",
  "facing",
  "target",
  "prop",
  "t",
  "tConfidence",
  "confidence",
  "style",
  "actionApproximated",
  "verb",
]);

export const OVERRIDE_SAFE_CHANGE_KEYS: ReadonlySet<string> = new Set(["t", "style", "actionApproximated", "verb"]);

export function eventChangesFrom(changes: unknown): { keys: string[]; fields: Partial<EventFields> } {
  if (!isRecord(changes)) return fail("update_event.changes must be an object");
  const keys = Object.keys(changes).filter((k) => changes[k] !== undefined);
  if (keys.length === 0) return fail("update_event.changes must change something");
  for (const k of keys) if (!EVENT_CHANGE_KEYS.has(k)) return fail(`update_event cannot change ${k}`);
  const fields: Partial<EventFields> = {};
  if ("witnessId" in changes) fields.witnessId = nonEmptyString(changes.witnessId, "changes.witnessId");
  if ("actor" in changes) fields.actor = nonEmptyString(changes.actor, "changes.actor");
  if ("action" in changes) fields.action = oneOf(changes.action, ACTIONS, "changes.action");
  if ("from" in changes) fields.fromAnchor = changes.from === null ? undefined : optionalAnchorRow(changes.from, "changes.from");
  if ("to" in changes) fields.toAnchor = changes.to === null ? undefined : optionalAnchorRow(changes.to, "changes.to");
  if ("at" in changes) fields.atAnchor = changes.at === null ? undefined : optionalAnchorRow(changes.at, "changes.at");
  if ("facing" in changes) fields.facing = changes.facing === null ? undefined : optionalString(changes.facing, "changes.facing");
  if ("target" in changes) fields.target = changes.target === null ? undefined : optionalString(changes.target, "changes.target");
  if ("prop" in changes) fields.prop = changes.prop === null ? undefined : optionalString(changes.prop, "changes.prop");
  if ("t" in changes) [fields.tStart, fields.tEnd] = intervalOf(changes.t, "changes.t");
  if ("tConfidence" in changes)
    fields.tConfidence = oneOf(changes.tConfidence, ["stated", "inferred"] as const, "changes.tConfidence");
  if ("confidence" in changes) fields.confidence = confidenceOf(changes.confidence, "changes.confidence");
  if ("style" in changes) fields.style = changes.style === null ? undefined : optionalStyle(changes.style, "changes.style");
  if ("actionApproximated" in changes)
    fields.actionApproximated =
      changes.actionApproximated === null ? undefined : optionalBoolean(changes.actionApproximated, "changes.actionApproximated");
  if ("verb" in changes) fields.verb = changes.verb === null ? undefined : optionalVerb(changes.verb, "changes.verb");
  return { keys, fields };
}

export type PropFields = {
  type: string;
  anchor: AnchorRow;
  heldBy: string | undefined;
  notes: string;
  sources: string[];
};

export function propFieldsFrom(value: unknown): PropFields {
  if (!isRecord(value)) return fail("prop must be an object");
  if (typeof value.notes !== "string") return fail("prop.notes must be a string");
  return {
    type: nonEmptyString(value.type, "prop.type"),
    anchor: toAnchorRow(anchorFrom(value.anchor, "prop.anchor")),
    heldBy: optionalString(value.heldBy, "prop.heldBy"),
    notes: value.notes,
    sources: sourcesOf(value.sources, "prop"),
  };
}

export function propChangesFrom(changes: unknown): Partial<Omit<PropFields, "sources">> {
  if (!isRecord(changes)) return fail("update_prop.changes must be an object");
  const keys = Object.keys(changes).filter((k) => changes[k] !== undefined);
  if (keys.length === 0) return fail("update_prop.changes must change something");
  const out: Partial<Omit<PropFields, "sources">> = {};
  for (const k of keys) {
    if (k === "type") out.type = nonEmptyString(changes.type, "changes.type");
    else if (k === "anchor") out.anchor = toAnchorRow(anchorFrom(changes.anchor, "changes.anchor"));
    else if (k === "heldBy") out.heldBy = changes.heldBy === null ? undefined : optionalString(changes.heldBy, "changes.heldBy");
    else if (k === "notes") {
      if (typeof changes.notes !== "string") return fail("changes.notes must be a string");
      out.notes = changes.notes;
    } else return fail(`update_prop cannot change ${k}`);
  }
  return out;
}

export function evidenceOf(json: string): Record<string, number | string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return fail("flag.evidence must be a JSON object");
  }
  if (!isRecord(parsed) || !Object.values(parsed).every((v) => typeof v === "number" || typeof v === "string"))
    return fail("flag.evidence must map names to numbers or strings");
  return parsed as Record<string, number | string>;
}

export type FlagRowInput = {
  id: string;
  eventId: string;
  check: string;
  severity: string;
  detail: string;
  evidence: string;
  conflictsWith: string[] | undefined;
  suggestedQuestion: string;
};

export function validateFlag(f: FlagRowInput): FlagRowInput {
  nonEmptyString(f.id, "flag.id");
  nonEmptyString(f.eventId, "flag.eventId");
  oneOf(f.check, CHECKS, "flag.check");
  oneOf(f.severity, ["hard", "soft"] as const, "flag.severity");
  nonEmptyString(f.detail, "flag.detail");
  nonEmptyString(f.suggestedQuestion, "flag.suggestedQuestion");
  evidenceOf(f.evidence);
  return f;
}

export function flagFromRow(f: FlagRowInput): Flag {
  return {
    id: f.id,
    eventId: f.eventId,
    check: f.check as Flag["check"],
    severity: f.severity as Flag["severity"],
    detail: f.detail,
    evidence: evidenceOf(f.evidence),
    ...(f.conflictsWith ? { conflictsWith: [...f.conflictsWith] } : {}),
    suggestedQuestion: f.suggestedQuestion,
  };
}

export type GraphRow = {
  sceneId: string;
  actors: { id: string; label: string; role: string; rig: string }[];
  events: {
    id: string;
    witnessId: string;
    actor: string;
    action: string;
    from: AnchorRow | undefined;
    to: AnchorRow | undefined;
    at: AnchorRow | undefined;
    facing: string | undefined;
    target: string | undefined;
    prop: string | undefined;
    t: number[];
    tConfidence: string;
    confidence: number;
    sources: string[];
    status: string;
    flags: FlagRowInput[];
    override: { by: string; reason: string; at: number; flagIds: string[] } | undefined;
    supersededBy: string | undefined;
    style: string | undefined;
    actionApproximated: boolean | undefined;
    verb: string | undefined;
  }[];
  props: {
    id: string;
    type: string;
    anchor: AnchorRow;
    heldBy: string | undefined;
    notes: string;
    sources: string[];
  }[];
  witnesses: { id: string; label: string; actorId: string | undefined }[] | undefined;
  version: number;
};

export function eventGraphFromRow(row: GraphRow): EventGraph {
  return {
    sceneId: row.sceneId,
    actors: row.actors.map((a) => ({
      id: a.id,
      label: a.label,
      role: a.role as EventGraph["actors"][number]["role"],
      rig: a.rig as EventGraph["actors"][number]["rig"],
    })),
    events: row.events.map((e): Event => {
      const override: Override | undefined = e.override
        ? { by: e.override.by, reason: e.override.reason, at: e.override.at, flagIds: [...e.override.flagIds] }
        : undefined;
      return {
        id: e.id,
        witnessId: e.witnessId,
        actor: e.actor,
        action: e.action as Event["action"],
        ...(e.from ? { from: fromAnchorRow(e.from) } : {}),
        ...(e.to ? { to: fromAnchorRow(e.to) } : {}),
        ...(e.at ? { at: fromAnchorRow(e.at) } : {}),
        ...(e.facing !== undefined ? { facing: e.facing } : {}),
        ...(e.target !== undefined ? { target: e.target } : {}),
        ...(e.prop !== undefined ? { prop: e.prop } : {}),
        t: [e.t[0]!, e.t[1]!],
        tConfidence: e.tConfidence as Event["tConfidence"],
        confidence: e.confidence,
        sources: [...e.sources],
        status: e.status as Status,
        flags: e.flags.map(flagFromRow),
        ...(override ? { override } : {}),
        ...(e.supersededBy !== undefined ? { supersededBy: e.supersededBy } : {}),
        ...(e.style !== undefined ? { style: e.style as ActionStyle } : {}),
        ...(e.actionApproximated !== undefined ? { actionApproximated: e.actionApproximated } : {}),
        ...(e.verb !== undefined ? { verb: e.verb } : {}),
      };
    }),
    props: row.props.map(
      (p): PropInstance => ({
        id: p.id,
        type: p.type,
        anchor: fromAnchorRow(p.anchor),
        ...(p.heldBy !== undefined ? { heldBy: p.heldBy } : {}),
        notes: p.notes,
        sources: [...p.sources],
      }),
    ),
    ...(row.witnesses ? { witnesses: row.witnesses.map((w) => ({ id: w.id, label: w.label, ...(w.actorId !== undefined ? { actorId: w.actorId } : {}) })) } : {}),
    version: row.version,
  };
}
