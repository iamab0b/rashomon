import { ACTIONS, ACTION_STYLES, MAX_VERB_CHARS, STYLE_ACTION } from "@rashomon/schema";
import type {
  Action,
  ActionStyle,
  Actor,
  Anchor,
  Event,
  Landmark,
  Patch,
  Segment,
} from "@rashomon/schema";
import { CONFIDENCE_MAP } from "./tools";
import type { BlockResult, ExtractContext, ToolUseBlock } from "./types";

class Invalid extends Error {}

type Input = Record<string, unknown>;

const isRecord = (v: unknown): v is Input =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const present = (v: unknown): boolean => v !== null && v !== undefined;

const reqString = (input: Input, key: string): string => {
  const v = input[key];
  if (typeof v !== "string" || v.trim() === "")
    throw new Invalid(`${key} must be a non-empty string`);
  return v.trim();
};

const optString = (input: Input, key: string): string | undefined => {
  const v = input[key];
  if (!present(v)) return undefined;
  if (typeof v !== "string") throw new Invalid(`${key} must be a string or null`);
  return v.trim();
};

const optNumber = (input: Input, key: string): number | undefined => {
  const v = input[key];
  if (!present(v)) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new Invalid(`${key} must be a finite number or null`);
  return v;
};

const norm = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, "");

export function resolveLandmarkId(
  raw: string,
  landmarks: Landmark[],
): string | null {
  const key = norm(raw);
  for (const l of landmarks)
    if (norm(l.id) === key || norm(l.label) === key) return l.id;
  for (const l of landmarks)
    if (l.aliases.some((a) => norm(a) === key)) return l.id;
  return null;
}

const landmarkOrThrow = (raw: string, ctx: ExtractContext, field: string) => {
  const id = resolveLandmarkId(raw, ctx.landmarks);
  if (id === null)
    throw new Invalid(
      `${field}: "${raw}" is not a landmark. Valid ids: ${ctx.landmarks.map((l) => l.id).join(", ")}`,
    );
  return id;
};

const buildAnchor = (
  raw: unknown,
  ctx: ExtractContext,
  field: string,
): Anchor | undefined => {
  if (!present(raw)) return undefined;
  if (!isRecord(raw)) throw new Invalid(`${field} must be an object or null`);
  const kind = raw.kind;
  const first = landmarkOrThrow(reqString(raw, "landmark"), ctx, field);
  if (kind === "at") return { kind: "at", landmark: first };
  if (kind === "near") {
    const radiusM = optNumber(raw, "radius_m");
    if (radiusM !== undefined && radiusM <= 0)
      throw new Invalid(`${field}.radius_m must be positive`);
    return radiusM === undefined
      ? { kind: "near", landmark: first }
      : { kind: "near", landmark: first, radiusM };
  }
  if (kind === "behind") return { kind: "behind", landmark: first };
  if (kind === "between") {
    const second = optString(raw, "second_landmark");
    if (second === undefined)
      throw new Invalid(`${field}: between needs second_landmark`);
    return {
      kind: "between",
      a: first,
      b: landmarkOrThrow(second, ctx, field),
    };
  }
  throw new Invalid(`${field}.kind must be at, near, behind or between`);
};

const buildSources = (
  input: Input,
  segment: Segment,
  ctx: ExtractContext,
): string[] => {
  const known = new Set([segment.id, ...ctx.recentSegments.map((s) => s.id)]);
  const given = Array.isArray(input.sources) ? input.sources : [];
  const kept = given.filter(
    (s): s is string => typeof s === "string" && known.has(s),
  );
  return [...new Set([...kept, segment.id])];
};

const buildInterval = (
  start: number | undefined,
  end: number | undefined,
  field: string,
): [number, number] => {
  if (start === undefined || end === undefined)
    throw new Invalid(`${field}: t_start and t_end are both required`);
  if (start < 0 || end < start)
    throw new Invalid(`${field}: need 0 <= t_start <= t_end, got [${start}, ${end}]`);
  return [start, end];
};

const actorIds = (ctx: ExtractContext): Set<string> =>
  new Set(ctx.actors.map((a) => a.id));

const requireActor = (id: string, ctx: ExtractContext, field: string) => {
  if (!actorIds(ctx).has(id))
    throw new Invalid(
      `${field}: "${id}" is not an actor. Valid ids: ${[...actorIds(ctx)].join(", ")}`,
    );
  return id;
};

const checkPropRef = (id: string, ctx: ExtractContext, pendingTypes: string[]) => {
  const ok =
    ctx.props.some((p) => p.id === id) ||
    ctx.propTypes.some((p) => p.type === id) ||
    pendingTypes.includes(id);
  if (!ok) throw new Invalid(`prop: "${id}" is not a known prop id or type`);
  return id;
};

const checkAction = (raw: string): Action => {
  if (!ACTIONS.includes(raw as Action))
    throw new Invalid(`action: "${raw}" is not one of ${ACTIONS.join(", ")}`);
  return raw as Action;
};

const checkStyle = (raw: string, action: Action): ActionStyle => {
  if (!ACTION_STYLES.includes(raw as ActionStyle))
    throw new Invalid(`style: "${raw}" is not one of ${ACTION_STYLES.join(", ")}`);
  const style = raw as ActionStyle;
  if (STYLE_ACTION[style] !== action)
    throw new Invalid(`style: ${style} goes with ${STYLE_ACTION[style]}, not ${action}. Use null`);
  return style;
};

const optBoolean = (input: Input, key: string): boolean | undefined => {
  const v = input[key];
  if (!present(v)) return undefined;
  if (typeof v !== "boolean") throw new Invalid(`${key} must be true, false or null`);
  return v;
};

const checkVerb = (raw: string | undefined, approximated: boolean): string | undefined => {
  const verb = raw === "" ? undefined : raw;
  if (!approximated) return undefined;
  if (verb === undefined)
    throw new Invalid("verb: actionApproximated is true, so give the witness's own verb");
  if (verb.length > MAX_VERB_CHARS)
    throw new Invalid(`verb: at most ${MAX_VERB_CHARS} characters, got ${verb.length}`);
  return verb;
};

const checkFacing = (raw: string, ctx: ExtractContext): string => {
  const lm = resolveLandmarkId(raw, ctx.landmarks);
  if (lm !== null) return lm;
  if (actorIds(ctx).has(raw)) return raw;
  throw new Invalid(`facing: "${raw}" is not a landmark or actor`);
};

const confidenceOf = (input: Input): number => {
  const v = input.confidence;
  if (v === "low" || v === "medium" || v === "high") return CONFIDENCE_MAP[v];
  throw new Invalid("confidence must be low, medium or high");
};

const addEvent = (
  input: Input,
  segment: Segment,
  ctx: ExtractContext,
  pendingTypes: string[],
): Patch => {
  const tConfidence = input.t_confidence;
  if (tConfidence !== "stated" && tConfidence !== "inferred")
    throw new Invalid("t_confidence must be stated or inferred");
  const event: Omit<Event, "id" | "status" | "flags"> = {
    witnessId: segment.witnessId,
    actor: requireActor(reqString(input, "actor"), ctx, "actor"),
    action: checkAction(reqString(input, "action")),
    t: buildInterval(optNumber(input, "t_start"), optNumber(input, "t_end"), "t"),
    tConfidence,
    confidence: confidenceOf(input),
    sources: buildSources(input, segment, ctx),
  };
  const from = buildAnchor(input.from, ctx, "from");
  const to = buildAnchor(input.to, ctx, "to");
  const at = buildAnchor(input.at, ctx, "at");
  if (from) event.from = from;
  if (to) event.to = to;
  if (at) event.at = at;
  const facing = optString(input, "facing");
  if (facing) event.facing = checkFacing(facing, ctx);
  const target = optString(input, "target");
  if (target) event.target = requireActor(target, ctx, "target");
  const prop = optString(input, "prop");
  if (prop) event.prop = checkPropRef(prop, ctx, pendingTypes);
  const style = optString(input, "style");
  if (style) event.style = checkStyle(style, event.action);
  const approximated = optBoolean(input, "actionApproximated") ?? false;
  const verb = checkVerb(optString(input, "verb"), approximated);
  if (approximated) {
    event.actionApproximated = true;
    event.verb = verb;
  }
  return { op: "add_event", event };
};

const findEvent = (id: string, ctx: ExtractContext): Event => {
  const found = ctx.events.find((e) => e.id === id);
  if (!found)
    throw new Invalid(
      `id: "${id}" is not an existing event. Existing: ${ctx.events.map((e) => e.id).join(", ") || "none"}`,
    );
  return found;
};

const updateEvent = (
  input: Input,
  segment: Segment,
  ctx: ExtractContext,
  pendingTypes: string[],
): Patch => {
  const id = reqString(input, "id");
  const existing = findEvent(id, ctx);
  const changes: Partial<Event> = {};
  const action = optString(input, "action");
  if (action) changes.action = checkAction(action);
  const from = buildAnchor(input.from, ctx, "from");
  const to = buildAnchor(input.to, ctx, "to");
  const at = buildAnchor(input.at, ctx, "at");
  if (from) changes.from = from;
  if (to) changes.to = to;
  if (at) changes.at = at;
  const facing = optString(input, "facing");
  if (facing) changes.facing = checkFacing(facing, ctx);
  const target = optString(input, "target");
  if (target) changes.target = requireActor(target, ctx, "target");
  const prop = optString(input, "prop");
  if (prop) changes.prop = checkPropRef(prop, ctx, pendingTypes);
  const cleared: Partial<Record<"style" | "verb", null>> = {};
  const nextAction = changes.action ?? existing.action;
  const style = optString(input, "style");
  if (style === "none") {
    if (existing.style) cleared.style = null;
  } else if (style) changes.style = checkStyle(style, nextAction);
  else if (existing.style && STYLE_ACTION[existing.style] !== nextAction) cleared.style = null;
  const approximated = optBoolean(input, "actionApproximated");
  if (approximated !== undefined) changes.actionApproximated = approximated;
  if (approximated === false && existing.verb) cleared.verb = null;
  const rawVerb = optString(input, "verb");
  if (rawVerb !== undefined || approximated === true) {
    const nowApproximated = approximated ?? existing.actionApproximated === true;
    const verb = checkVerb(rawVerb ?? existing.verb, nowApproximated);
    if (verb !== undefined && verb !== existing.verb) changes.verb = verb;
  }
  const start = optNumber(input, "t_start");
  const end = optNumber(input, "t_end");
  if (start !== undefined || end !== undefined)
    changes.t = buildInterval(
      start ?? existing.t[0],
      end ?? existing.t[1],
      "t",
    );
  if (Object.keys(changes).length === 0 && Object.keys(cleared).length === 0)
    throw new Invalid("update_event changed nothing; every field was null");
  return {
    op: "update_event",
    id,
    changes: { ...changes, ...cleared } as Partial<Event>,
    sources: buildSources(input, segment, ctx),
  };
};

const addProp = (
  input: Input,
  segment: Segment,
  ctx: ExtractContext,
): Patch => {
  const type = reqString(input, "type");
  if (!ctx.propTypes.some((p) => p.type === type))
    throw new Invalid(
      `type: "${type}" is not in the props library. Valid: ${ctx.propTypes.map((p) => p.type).join(", ")}`,
    );
  const anchor = buildAnchor(input.anchor, ctx, "anchor");
  if (!anchor)
    throw new Invalid(
      "anchor is required for add_prop: use the landmark nearest where the prop is, even if the prop is held",
    );
  const prop: Extract<Patch, { op: "add_prop" }>["prop"] = {
    type,
    anchor,
    notes: typeof input.notes === "string" ? input.notes : "",
    sources: buildSources(input, segment, ctx),
  };
  const heldBy = optString(input, "held_by");
  if (heldBy) prop.heldBy = requireActor(heldBy, ctx, "held_by");
  return { op: "add_prop", prop };
};

const updateProp = (
  input: Input,
  segment: Segment,
  ctx: ExtractContext,
): Patch => {
  const id = reqString(input, "id");
  if (!ctx.props.some((p) => p.id === id))
    throw new Invalid(`id: "${id}" is not an existing prop`);
  const changes: Extract<Patch, { op: "update_prop" }>["changes"] = {};
  const anchor = buildAnchor(input.anchor, ctx, "anchor");
  if (anchor) changes.anchor = anchor;
  const heldBy = optString(input, "held_by");
  if (heldBy) changes.heldBy = requireActor(heldBy, ctx, "held_by");
  const notes = optString(input, "notes");
  if (notes !== undefined) changes.notes = notes;
  if (Object.keys(changes).length === 0)
    throw new Invalid("update_prop changed nothing; every field was null");
  return {
    op: "update_prop",
    id,
    changes,
    sources: buildSources(input, segment, ctx),
  };
};

const addActor = (input: Input, ctx: ExtractContext): Patch => {
  const id = reqString(input, "id");
  if (actorIds(ctx).has(id)) throw new Invalid(`id: actor "${id}" already exists`);
  const role = input.role;
  if (
    role !== "witness" &&
    role !== "suspect" &&
    role !== "victim" &&
    role !== "other"
  )
    throw new Invalid("role must be witness, suspect, victim or other");
  const actor: Actor = {
    id,
    label: reqString(input, "label"),
    role,
    rig: "mixamo_ybot",
  };
  return { op: "add_actor", actor };
};

export function validateToolUses(
  blocks: ToolUseBlock[],
  segment: Segment,
  base: ExtractContext,
): BlockResult[] {
  let ctx = base;
  const pendingTypes: string[] = [];
  const results: BlockResult[] = [];
  for (const block of blocks) {
    try {
      const input = isRecord(block.input) ? block.input : {};
      let patch: Patch | null;
      switch (block.name) {
        case "add_event":
          patch = addEvent(input, segment, ctx, pendingTypes);
          break;
        case "update_event":
          patch = updateEvent(input, segment, ctx, pendingTypes);
          break;
        case "retract_event": {
          const id = reqString(input, "id");
          findEvent(id, ctx);
          patch = {
            op: "retract_event",
            id,
            sources: buildSources(input, segment, ctx),
          };
          break;
        }
        case "add_prop":
          patch = addProp(input, segment, ctx);
          break;
        case "update_prop":
          patch = updateProp(input, segment, ctx);
          break;
        case "add_actor":
          patch = addActor(input, ctx);
          break;
        case "no_events":
          patch = null;
          break;
        default:
          throw new Invalid(`unknown tool "${block.name}"`);
      }
      if (patch?.op === "add_actor")
        ctx = { ...ctx, actors: [...ctx.actors, patch.actor] };
      if (patch?.op === "add_prop") pendingTypes.push(patch.prop.type);
      results.push({
        toolUseId: block.id,
        name: block.name,
        patches: patch ? [patch] : [],
      });
    } catch (err) {
      if (!(err instanceof Invalid)) throw err;
      results.push({
        toolUseId: block.id,
        name: block.name,
        patches: [],
        error: err.message,
      });
    }
  }
  return results;
}
