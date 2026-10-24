import { gate, resolve } from "@rashomon/engine";
import { storeScene } from "@rashomon/schema/fixtures";
import type { SceneManifest } from "@rashomon/schema";
import { t } from "spacetimedb/server";
import type { ReducerCtx } from "spacetimedb/server";
import {
  MIN_OVERRIDE_REASON_CHARS,
  SEGMENT_SOURCES,
  SPEAKERS,
  RIGS,
  ROLES,
  STATUSES,
  eventChangesFrom,
  eventFieldsFrom,
  eventGraphFromRow,
  fail,
  idOf,
  intervalOf,
  isRecord,
  nonEmptyString,
  oneOf,
  optionalId,
  propChangesFrom,
  propFieldsFrom,
  sourcesOf,
  validateFlag,
} from "./convert";
import { buildGraph, type ModuleSchema } from "./graph";
import { EventGraphT, FlagT, StatusEntryT, UtteranceInputT, spacetimedb } from "./tables";

type Ctx = ReducerCtx<ModuleSchema>;

export const key = (sessionId: string, id: string): string => `${sessionId}/${id}`;

const MANIFESTS: Record<string, SceneManifest> = { store_v1: storeScene };

export function manifestFor(sceneId: string): SceneManifest {
  return MANIFESTS[sceneId] ?? fail(`unknown sceneId ${sceneId}; known scenes: ${Object.keys(MANIFESTS).join(", ")}`);
}

const isRetracted = (e: { status: string; supersededBy?: string | undefined }): boolean =>
  e.status === "superseded" || e.supersededBy !== undefined;

function regate(ctx: Ctx, sessionId: string): void {
  const session = requireSession(ctx, sessionId);
  const manifest = manifestFor(session.sceneId);
  const row = buildGraph(ctx.db, sessionId) ?? fail(`unknown session ${sessionId}`);
  const graph = eventGraphFromRow(row);
  const judged = {
    ...graph,
    events: graph.events.map((e) => ({ ...e, status: isRetracted(e) ? ("superseded" as const) : ("proposed" as const) })),
  };
  const { statuses, flags } = gate(resolve(judged, manifest), manifest, { meshes: [] });
  for (const e of ctx.db.events.sessionId.filter(sessionId)) {
    const next = statuses[e.id];
    if (next !== undefined && next !== e.status) ctx.db.events.rowKey.update({ ...e, status: next });
  }
  const old = [...ctx.db.flags.sessionId.filter(sessionId)].map((f) => f.rowKey);
  for (const rowKey of old) ctx.db.flags.rowKey.delete(rowKey);
  flags.forEach((f, i) =>
    ctx.db.flags.insert({
      rowKey: key(sessionId, f.id),
      sessionId,
      seq: i + 1,
      id: f.id,
      eventId: f.eventId,
      check: f.check,
      severity: f.severity,
      detail: f.detail,
      evidence: JSON.stringify(f.evidence),
      conflictsWith: f.conflictsWith,
      suggestedQuestion: f.suggestedQuestion,
    }),
  );
}

function requireSession(ctx: Ctx, sessionId: string) {
  return ctx.db.sessions.id.find(sessionId) ?? fail(`unknown session ${sessionId}`);
}

function requireEvent(ctx: Ctx, sessionId: string, eventId: string) {
  const row = ctx.db.events.rowKey.find(key(sessionId, eventId));
  if (!row || row.sessionId !== sessionId) return fail(`unknown event ${eventId}`);
  return row;
}

function requireProp(ctx: Ctx, sessionId: string, propId: string) {
  const row = ctx.db.props.rowKey.find(key(sessionId, propId));
  if (!row || row.sessionId !== sessionId) return fail(`unknown prop ${propId}`);
  return row;
}

function idFor(prefix: string, given: string | undefined, existing: Iterable<{ id: string }>, what: string): string {
  const taken = new Set<string>();
  let count = 0;
  for (const row of existing) {
    taken.add(row.id);
    count += 1;
  }
  if (given !== undefined) {
    if (taken.has(given)) return fail(`${what} ${given} already exists`);
    return given;
  }
  let n = count + 1;
  while (taken.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

function checkReferences(ctx: Ctx, sessionId: string): void {
  const actors = new Set<string>();
  for (const a of ctx.db.actors.sessionId.filter(sessionId)) actors.add(a.id);
  const props = new Set<string>();
  for (const p of ctx.db.props.sessionId.filter(sessionId)) props.add(p.id);
  for (const e of ctx.db.events.sessionId.filter(sessionId)) {
    if (!actors.has(e.actor)) fail(`event ${e.id} names unknown actor ${e.actor}`);
    if (e.target !== undefined && !actors.has(e.target)) fail(`event ${e.id} names unknown target ${e.target}`);
    if (e.prop !== undefined && !props.has(e.prop)) fail(`event ${e.id} names unknown prop ${e.prop}`);
  }
}

const nextSeq = (rows: Iterable<{ seq: number }>): number => {
  let max = 0;
  for (const r of rows) max = Math.max(max, r.seq);
  return max + 1;
};

const union = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])];

function applyOverride(ctx: Ctx, sessionId: string, eventId: string, reason: unknown, by: unknown): void {
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length < MIN_OVERRIDE_REASON_CHARS)
    fail(`override reason must be at least ${MIN_OVERRIDE_REASON_CHARS} characters`);
  const who = nonEmptyString(by, "override.by");
  const event = requireEvent(ctx, sessionId, eventId);
  if (isRetracted(event)) fail(`event ${eventId} was retracted and cannot be overridden`);
  if (event.status !== "implausible")
    fail(`event ${eventId} is ${event.status}; only implausible events can be overridden`);
  const flagIds = [...ctx.db.flags.eventId.filter(eventId)]
    .filter((f) => f.sessionId === sessionId && f.severity === "hard")
    .map((f) => f.id);
  ctx.db.overrides.rowKey.delete(key(sessionId, eventId));
  ctx.db.overrides.insert({
    rowKey: key(sessionId, eventId),
    sessionId,
    eventId,
    by: who,
    sender: ctx.sender.toHexString(),
    reason: why,
    at: Number(ctx.timestamp.microsSinceUnixEpoch / 1000n),
    flagIds,
  });
}

function applyPatch(ctx: Ctx, sessionId: string, patch: unknown): string[] {
  if (!isRecord(patch)) return fail("each patch must be an object");
  switch (patch.op) {
    case "add_event": {
      const f = eventFieldsFrom(patch.event);
      const existing = [...ctx.db.events.sessionId.filter(sessionId)];
      const id = idFor("e", optionalId((patch.event as Record<string, unknown>).id, "event.id"), existing, "event");
      ctx.db.events.insert({
        rowKey: key(sessionId, id),
        sessionId,
        seq: nextSeq(existing),
        id,
        ...f,
        status: "proposed",
      });
      return f.sources;
    }
    case "update_event": {
      const id = idOf(patch.id, "update_event.id");
      const sources = sourcesOf(patch.sources, "update_event");
      const event = requireEvent(ctx, sessionId, id);
      if (isRetracted(event)) return fail(`event ${id} was retracted and cannot be updated`);
      const { keys, fields } = eventChangesFrom(patch.changes);
      const onlyTime = keys.every((k) => k === "t");
      if (!onlyTime) ctx.db.overrides.rowKey.delete(key(sessionId, id));
      ctx.db.events.rowKey.update({
        ...event,
        ...fields,
        sources: union(event.sources, sources),
      });
      return sources;
    }
    case "retract_event": {
      const id = idOf(patch.id, "retract_event.id");
      const sources = sourcesOf(patch.sources, "retract_event");
      const event = requireEvent(ctx, sessionId, id);
      ctx.db.events.rowKey.update({
        ...event,
        sources: union(event.sources, sources),
        supersededBy: event.supersededBy ?? sources[0],
      });
      return sources;
    }
    case "add_prop": {
      const f = propFieldsFrom(patch.prop);
      const existing = [...ctx.db.props.sessionId.filter(sessionId)];
      const id = idFor("p", optionalId((patch.prop as Record<string, unknown>).id, "prop.id"), existing, "prop");
      ctx.db.props.insert({ rowKey: key(sessionId, id), sessionId, seq: nextSeq(existing), id, ...f });
      return f.sources;
    }
    case "update_prop": {
      const id = idOf(patch.id, "update_prop.id");
      const sources = sourcesOf(patch.sources, "update_prop");
      const prop = requireProp(ctx, sessionId, id);
      ctx.db.props.rowKey.update({ ...prop, ...propChangesFrom(patch.changes), sources: union(prop.sources, sources) });
      return sources;
    }
    case "add_actor": {
      const a = isRecord(patch.actor) ? patch.actor : fail("add_actor.actor must be an object");
      const id = idOf(a.id, "actor.id");
      const rowKey = key(sessionId, id);
      if (ctx.db.actors.rowKey.find(rowKey)) fail(`actor ${id} already exists`);
      ctx.db.actors.insert({
        rowKey,
        sessionId,
        seq: nextSeq(ctx.db.actors.sessionId.filter(sessionId)),
        id,
        label: nonEmptyString(a.label, "actor.label"),
        role: oneOf(a.role, ROLES, "actor.role"),
        rig: oneOf(a.rig, RIGS, "actor.rig"),
      });
      return [];
    }
    case "override":
      applyOverride(ctx, sessionId, idOf(patch.id, "override.id"), patch.reason, patch.by);
      return [];
    default:
      return fail("patch.op must be add_event, update_event, retract_event, add_prop, update_prop, add_actor or override");
  }
}

export const createSession = spacetimedb.reducer(
  { id: t.string(), sceneId: t.string() },
  (ctx, { id, sceneId }) => {
    idOf(id, "session id");
    nonEmptyString(sceneId, "sceneId");
    manifestFor(sceneId);
    if (ctx.db.sessions.id.find(id)) fail(`session ${id} already exists`);
    ctx.db.sessions.insert({ id, sceneId, version: 0, creator: ctx.sender.toHexString(), createdAt: ctx.timestamp });
  },
);

export const insertSegment = spacetimedb.reducer(
  {
    id: t.string(),
    sessionId: t.string(),
    witnessId: t.string(),
    speaker: t.string(),
    text: t.string(),
    tStart: t.f64(),
    tEnd: t.f64(),
    source: t.string(),
    supersedes: t.option(t.string()),
    utterances: t.array(UtteranceInputT),
  },
  (ctx, a) => {
    requireSession(ctx, a.sessionId);
    idOf(a.id, "segment id");
    nonEmptyString(a.witnessId, "segment witnessId");
    nonEmptyString(a.text, "segment text");
    oneOf(a.speaker, SPEAKERS, "segment speaker");
    oneOf(a.source, SEGMENT_SOURCES, "segment source");
    intervalOf([a.tStart, a.tEnd], "segment t");
    const segmentKey = key(a.sessionId, a.id);
    if (ctx.db.segments.rowKey.find(segmentKey)) fail(`segment ${a.id} already exists`);
    if (a.supersedes !== undefined) {
      idOf(a.supersedes, "segment supersedes");
      const earlier = ctx.db.segments.rowKey.find(key(a.sessionId, a.supersedes));
      if (!earlier || earlier.sessionId !== a.sessionId) fail(`unknown segment ${a.supersedes}`);
    }
    const seen = new Set<string>();
    for (const u of a.utterances) {
      idOf(u.id, "utterance id");
      intervalOf([u.tStart, u.tEnd], `utterance ${u.id} t`);
      if (seen.has(u.id) || ctx.db.utterances.rowKey.find(key(a.sessionId, u.id)))
        fail(`utterance ${u.id} already exists`);
      seen.add(u.id);
    }
    ctx.db.segments.insert({
      rowKey: segmentKey,
      id: a.id,
      sessionId: a.sessionId,
      witnessId: a.witnessId,
      speaker: a.speaker,
      text: a.text,
      tStart: a.tStart,
      tEnd: a.tEnd,
      source: a.source,
      supersedes: a.supersedes,
      extractModel: undefined,
      extractPromptHash: undefined,
      extractUtteranceIds: undefined,
      extractedAt: undefined,
      extractPatchCount: undefined,
      extractError: undefined,
    });
    for (const u of a.utterances)
      ctx.db.utterances.insert({
        rowKey: key(a.sessionId, u.id),
        sessionId: a.sessionId,
        id: u.id,
        segmentKey,
        text: u.text,
        tStart: u.tStart,
        tEnd: u.tEnd,
      });
  },
);

export function applyPatchBatch(ctx: Ctx, sessionId: string, baseVersion: number, patches: unknown): void {
  const session = requireSession(ctx, sessionId);
  if (baseVersion !== session.version)
    fail(`stale baseVersion ${baseVersion}; the graph is at version ${session.version}`);
  if (!Array.isArray(patches) || patches.length === 0) return fail("patchesJson must be a non-empty array of patches");
  const appliedVersion = session.version + 1;
  const touched = new Set<string>();
  for (const patch of patches) {
    if (isRecord(patch)) {
      if (patch.op === "override" && typeof patch.id === "string" && touched.has(patch.id)) {
        regate(ctx, sessionId);
      }
      if (patch.op === "update_event" || patch.op === "retract_event") {
        if (typeof patch.id === "string") touched.add(patch.id);
      } else if (patch.op === "add_event" && isRecord(patch.event) && typeof patch.event.id === "string") {
        touched.add(patch.event.id);
      }
    }
    const sources = applyPatch(ctx, sessionId, patch);
    ctx.db.patches.insert({
      id: 0n,
      sessionId,
      baseVersion,
      appliedVersion,
      op: String((patch as { op: unknown }).op),
      payload: JSON.stringify(patch),
      sources,
      appliedAt: ctx.timestamp,
    });
  }
  checkReferences(ctx, sessionId);
  ctx.db.sessions.id.update({ ...session, version: appliedVersion });
  regate(ctx, sessionId);
}

export const applyPatches = spacetimedb.reducer(
  { sessionId: t.string(), baseVersion: t.u32(), patchesJson: t.string() },
  (ctx, { sessionId, baseVersion, patchesJson }) => {
    let patches: unknown;
    try {
      patches = JSON.parse(patchesJson);
    } catch {
      return fail("patchesJson must be a JSON array of patches");
    }
    applyPatchBatch(ctx, sessionId, baseVersion, patches);
  },
);

export const override = spacetimedb.reducer(
  { sessionId: t.string(), eventId: t.string(), reason: t.string(), by: t.string() },
  (ctx, { sessionId, eventId, reason, by }) => {
    requireSession(ctx, sessionId);
    applyOverride(ctx, sessionId, eventId, reason, by);
    regate(ctx, sessionId);
  },
);

export const setStatuses = spacetimedb.reducer(
  { sessionId: t.string(), baseVersion: t.u32(), statuses: t.array(StatusEntryT), flags: t.array(FlagT) },
  (ctx, { sessionId, baseVersion, statuses, flags }) => {
    const session = requireSession(ctx, sessionId);
    const sender = ctx.sender.toHexString();
    if (sender !== ctx.databaseIdentity.toHexString() && sender !== session.creator)
      fail("only the module or the session's creator can set statuses");
    if (baseVersion !== session.version)
      fail(`stale baseVersion ${baseVersion}; the graph is at version ${session.version}`);
    const resulting = new Map<string, string>();
    for (const e of ctx.db.events.sessionId.filter(sessionId)) resulting.set(e.id, e.status);

    for (const entry of statuses) {
      const current = resulting.get(entry.eventId) ?? fail(`unknown event ${entry.eventId}`);
      const next = oneOf(entry.status, STATUSES, "status");
      const locked = current === "overridden" || current === "superseded";
      if (locked && next !== current) fail(`event ${entry.eventId} is ${current} and cannot be changed by a gate run`);
      if (!locked && (next === "overridden" || next === "superseded"))
        fail(`a gate run cannot set ${next}; use an override or a retraction`);
      resulting.set(entry.eventId, next);
    }

    const ids = new Set<string>();
    for (const f of flags) {
      validateFlag(f);
      if (ids.has(f.id)) fail(`duplicate flag id ${f.id}`);
      ids.add(f.id);
      const status = resulting.get(f.eventId) ?? fail(`flag ${f.id} names unknown event ${f.eventId}`);
      if (f.severity === "hard" && status !== "implausible" && status !== "overridden" && status !== "superseded")
        fail(`event ${f.eventId} has hard flag ${f.id} but status ${status}`);
    }

    for (const entry of statuses) {
      const row = requireEvent(ctx, sessionId, entry.eventId);
      if (row.status !== entry.status) ctx.db.events.rowKey.update({ ...row, status: entry.status });
    }
    const old = [...ctx.db.flags.sessionId.filter(sessionId)].map((f) => f.rowKey);
    for (const rowKey of old) ctx.db.flags.rowKey.delete(rowKey);
    flags.forEach((f, i) =>
      ctx.db.flags.insert({ rowKey: key(sessionId, f.id), sessionId, seq: i + 1, ...f }),
    );
  },
);

export const graphForScene = spacetimedb.anonymousView(
  { public: true },
  { sessionId: t.string() },
  t.option(EventGraphT),
  (ctx, { sessionId }) => buildGraph(ctx.db, sessionId),
);
