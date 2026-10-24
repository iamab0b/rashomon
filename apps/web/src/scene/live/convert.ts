import {
  ACTIONS,
  type Actor,
  type Anchor,
  type Event,
  type EventGraph,
  type Flag,
  type Override,
  type PropInstance,
  type Status,
} from "@rashomon/schema";
import type {
  Actor as ActorRow,
  Anchor as AnchorRow,
  Event as EventRow,
  EventGraph as GraphRow,
  Flag as FlagRow,
  OverrideRecord as OverrideRow,
  PropInstance as PropRow,
} from "./bindings/types";

export type LiveGraphRow = GraphRow;

const STATUSES: readonly Status[] = ["proposed", "plausible", "implausible", "overridden", "superseded"];
const CHECKS: readonly Flag["check"][] = [
  "sightline",
  "reachability",
  "time_distance",
  "contradiction",
  "unanchored",
  "missing_time",
];
const SEVERITIES: readonly Flag["severity"][] = ["hard", "soft"];
const ROLES: readonly Actor["role"][] = ["witness", "suspect", "victim", "other"];
const RIGS: readonly Actor["rig"][] = ["mixamo_ybot", "mixamo_xbot"];
const T_CONFIDENCES: readonly Event["tConfidence"][] = ["stated", "inferred"];
const XYZ_LENGTH = 3;
const INTERVAL_LENGTH = 2;

function reject(field: string, detail: string): never {
  throw new Error(`live row rejected: ${field} ${detail}`);
}

function oneOf<T extends string>(value: string, allowed: readonly T[], field: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  return reject(field, `"${value}" is not one of ${allowed.join(", ")}`);
}

function present<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function required<T>(value: T | null | undefined, field: string): T {
  return present(value) ? value : reject(field, "is missing");
}

function convertAnchor(row: AnchorRow, field: string): Anchor {
  switch (row.kind) {
    case "at":
      return { kind: "at", landmark: required(row.landmark, `${field}.landmark`) };
    case "behind":
      return { kind: "behind", landmark: required(row.landmark, `${field}.landmark`) };
    case "near":
      return {
        kind: "near",
        landmark: required(row.landmark, `${field}.landmark`),
        ...(present(row.radiusM) ? { radiusM: row.radiusM } : {}),
      };
    case "between":
      return { kind: "between", a: required(row.a, `${field}.a`), b: required(row.b, `${field}.b`) };
    case "xyz": {
      const position = required(row.position, `${field}.position`);
      if (position.length !== XYZ_LENGTH) reject(`${field}.position`, `has ${position.length} values, not 3`);
      return { kind: "xyz", position: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0] };
    }
    default:
      return reject(`${field}.kind`, `"${row.kind}" is not an anchor kind`);
  }
}

function parseEvidence(json: string, field: string): Flag["evidence"] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return reject(field, "is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return reject(field, "is not an object");
  const entries = Object.entries(parsed);
  if (entries.some(([, value]) => typeof value !== "number" && typeof value !== "string")) {
    return reject(field, "holds a value that is neither a number nor a string");
  }
  return Object.fromEntries(entries) as Flag["evidence"];
}

function convertFlag(row: FlagRow): Flag {
  const field = `flag ${row.id}`;
  return {
    id: row.id,
    eventId: row.eventId,
    check: oneOf(row.check, CHECKS, `${field}.check`),
    severity: oneOf(row.severity, SEVERITIES, `${field}.severity`),
    detail: row.detail,
    evidence: parseEvidence(row.evidence, `${field}.evidence`),
    ...(present(row.conflictsWith) ? { conflictsWith: [...row.conflictsWith] } : {}),
    suggestedQuestion: row.suggestedQuestion,
  };
}

function convertOverride(row: OverrideRow): Override {
  return { by: row.by, reason: row.reason, at: row.at, flagIds: [...row.flagIds] };
}

function convertInterval(t: readonly number[], field: string): [number, number] {
  if (t.length !== INTERVAL_LENGTH) reject(field, `has ${t.length} values, not 2`);
  return [t[0] ?? 0, t[1] ?? 0];
}

function convertEvent(row: EventRow): Event {
  const field = `event ${row.id}`;
  return {
    id: row.id,
    witnessId: row.witnessId,
    actor: row.actor,
    action: oneOf(row.action, ACTIONS, `${field}.action`),
    ...(present(row.from) ? { from: convertAnchor(row.from, `${field}.from`) } : {}),
    ...(present(row.to) ? { to: convertAnchor(row.to, `${field}.to`) } : {}),
    ...(present(row.at) ? { at: convertAnchor(row.at, `${field}.at`) } : {}),
    ...(present(row.facing) ? { facing: row.facing } : {}),
    ...(present(row.target) ? { target: row.target } : {}),
    ...(present(row.prop) ? { prop: row.prop } : {}),
    t: convertInterval(row.t, `${field}.t`),
    tConfidence: oneOf(row.tConfidence, T_CONFIDENCES, `${field}.tConfidence`),
    confidence: row.confidence,
    sources: [...row.sources],
    status: oneOf(row.status, STATUSES, `${field}.status`),
    flags: row.flags.map(convertFlag),
    ...(present(row.override) ? { override: convertOverride(row.override) } : {}),
    ...(present(row.supersededBy) ? { supersededBy: row.supersededBy } : {}),
  };
}

function convertActor(row: ActorRow): Actor {
  return {
    id: row.id,
    label: row.label,
    role: oneOf(row.role, ROLES, `actor ${row.id}.role`),
    rig: oneOf(row.rig, RIGS, `actor ${row.id}.rig`),
  };
}

function convertProp(row: PropRow): PropInstance {
  return {
    id: row.id,
    type: row.type,
    anchor: convertAnchor(row.anchor, `prop ${row.id}.anchor`),
    ...(present(row.heldBy) ? { heldBy: row.heldBy } : {}),
    notes: row.notes,
    sources: [...row.sources],
  };
}

export function convertGraphRow(row: LiveGraphRow): EventGraph {
  return {
    sceneId: row.sceneId,
    actors: row.actors.map(convertActor),
    events: row.events.map(convertEvent),
    props: row.props.map(convertProp),
    ...(row.witnesses ? { witnesses: row.witnesses.map((w) => ({ id: w.id, label: w.label, ...(w.actorId !== undefined ? { actorId: w.actorId } : {}) })) } : {}),
    version: row.version,
  };
}
