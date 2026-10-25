import { ACTIONS, ACTION_STYLES, MAX_VERB_CHARS, STYLE_ACTION } from "@rashomon/schema";
import type { Anchor, Patch } from "@rashomon/schema";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isVec3 = (v: unknown): boolean =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number");

export const isAnchor = (v: unknown): v is Anchor => {
  if (!isRecord(v)) return false;
  if (v.kind === "at" || v.kind === "behind" || v.kind === "near")
    return typeof v.landmark === "string";
  if (v.kind === "between")
    return typeof v.a === "string" && typeof v.b === "string";
  if (v.kind === "xyz") return isVec3(v.position);
  return false;
};

const sourcesOk = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every((s) => typeof s === "string" && s.length > 0);

const interval = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.length === 2 &&
  v.every((n) => typeof n === "number") &&
  (v[0] as number) <= (v[1] as number);

export const CONFIDENCE_VALUES: readonly number[] = [0.3, 0.6, 0.9];

const anchorsOk = (o: Record<string, unknown>): boolean =>
  (["from", "to", "at", "anchor"] as const).every(
    (k) => o[k] === undefined || isAnchor(o[k]),
  );

const styleOk = (style: unknown, action: unknown, clearable = false): boolean =>
  style === undefined ||
  (clearable && style === null) ||
  (ACTION_STYLES.includes(style as never) &&
    (action === undefined || STYLE_ACTION[style as keyof typeof STYLE_ACTION] === action));

const verbOk = (o: Record<string, unknown>, clearable = false): boolean =>
  (o.actionApproximated === undefined || typeof o.actionApproximated === "boolean") &&
  (o.verb === undefined ||
    (clearable && o.verb === null) ||
    (typeof o.verb === "string" && o.verb.length <= MAX_VERB_CHARS));

export const isPatch = (v: unknown): v is Patch => {
  if (!isRecord(v)) return false;
  switch (v.op) {
    case "add_event": {
      const e = v.event;
      return (
        isRecord(e) &&
        typeof e.witnessId === "string" &&
        typeof e.actor === "string" &&
        ACTIONS.includes(e.action as never) &&
        interval(e.t) &&
        (e.tConfidence === "stated" || e.tConfidence === "inferred") &&
        typeof e.confidence === "number" &&
        CONFIDENCE_VALUES.includes(e.confidence) &&
        sourcesOk(e.sources) &&
        anchorsOk(e) &&
        styleOk(e.style, e.action) &&
        verbOk(e)
      );
    }
    case "update_event":
      return (
        typeof v.id === "string" &&
        isRecord(v.changes) &&
        sourcesOk(v.sources) &&
        anchorsOk(v.changes) &&
        styleOk(v.changes.style, v.changes.action, true) &&
        verbOk(v.changes, true)
      );
    case "retract_event":
      return typeof v.id === "string" && sourcesOk(v.sources);
    case "add_prop": {
      const p = v.prop;
      return (
        isRecord(p) &&
        typeof p.type === "string" &&
        isAnchor(p.anchor) &&
        typeof p.notes === "string" &&
        sourcesOk(p.sources)
      );
    }
    case "update_prop":
      return (
        typeof v.id === "string" &&
        isRecord(v.changes) &&
        sourcesOk(v.sources) &&
        anchorsOk(v.changes)
      );
    case "add_actor":
      return (
        isRecord(v.actor) &&
        typeof v.actor.id === "string" &&
        typeof v.actor.label === "string"
      );
    default:
      return false;
  }
};

export const isPatchList = (v: unknown): v is Patch[] =>
  Array.isArray(v) && v.every(isPatch);
