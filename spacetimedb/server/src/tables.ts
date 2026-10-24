import { schema, table, t } from "spacetimedb/server";

export const AnchorT = t.object("Anchor", {
  kind: t.string(),
  landmark: t.option(t.string()),
  radiusM: t.option(t.f64()),
  a: t.option(t.string()),
  b: t.option(t.string()),
  position: t.option(t.array(t.f64())),
});

export const ActorT = t.object("Actor", {
  id: t.string(),
  label: t.string(),
  role: t.string(),
  rig: t.string(),
});

export const FlagT = t.object("Flag", {
  id: t.string(),
  eventId: t.string(),
  check: t.string(),
  severity: t.string(),
  detail: t.string(),
  evidence: t.string(),
  conflictsWith: t.option(t.array(t.string())),
  suggestedQuestion: t.string(),
});

export const OverrideT = t.object("OverrideRecord", {
  by: t.string(),
  reason: t.string(),
  at: t.f64(),
  flagIds: t.array(t.string()),
});

export const EventT = t.object("Event", {
  id: t.string(),
  witnessId: t.string(),
  actor: t.string(),
  action: t.string(),
  from: t.option(AnchorT),
  to: t.option(AnchorT),
  at: t.option(AnchorT),
  facing: t.option(t.string()),
  target: t.option(t.string()),
  prop: t.option(t.string()),
  t: t.array(t.f64()),
  tConfidence: t.string(),
  confidence: t.f64(),
  sources: t.array(t.string()),
  status: t.string(),
  flags: t.array(FlagT),
  override: t.option(OverrideT),
  supersededBy: t.option(t.string()),
});

export const PropT = t.object("PropInstance", {
  id: t.string(),
  type: t.string(),
  anchor: AnchorT,
  heldBy: t.option(t.string()),
  notes: t.string(),
  sources: t.array(t.string()),
});

export const EventGraphT = t.object("EventGraph", {
  sceneId: t.string(),
  actors: t.array(ActorT),
  events: t.array(EventT),
  props: t.array(PropT),
  version: t.u32(),
});

export const UtteranceInputT = t.object("UtteranceInput", {
  id: t.string(),
  text: t.string(),
  tStart: t.f64(),
  tEnd: t.f64(),
});

export const StatusEntryT = t.object("StatusEntry", {
  eventId: t.string(),
  status: t.string(),
});

const sessions = table(
  { name: "sessions", public: true },
  {
    id: t.string().primaryKey(),
    sceneId: t.string(),
    version: t.u32(),
    creator: t.string(),
    createdAt: t.timestamp(),
  },
);

const segments = table(
  { name: "segments", public: true },
  {
    rowKey: t.string().primaryKey(),
    sessionId: t.string().index(),
    id: t.string(),
    witnessId: t.string(),
    speaker: t.string(),
    text: t.string(),
    tStart: t.f64(),
    tEnd: t.f64(),
    source: t.string(),
    supersedes: t.option(t.string()),
    extractModel: t.option(t.string()),
    extractPromptHash: t.option(t.string()),
    extractUtteranceIds: t.option(t.array(t.string())),
    extractedAt: t.option(t.timestamp()),
    extractPatchCount: t.option(t.u32()),
    extractError: t.option(t.string()),
  },
);

const utterances = table(
  { name: "utterances", public: true },
  {
    rowKey: t.string().primaryKey(),
    sessionId: t.string().index(),
    id: t.string(),
    segmentKey: t.string().index(),
    text: t.string(),
    tStart: t.f64(),
    tEnd: t.f64(),
  },
);

const actors = table(
  { name: "actors", public: true },
  {
    rowKey: t.string().primaryKey(),
    sessionId: t.string().index(),
    seq: t.u32(),
    id: t.string(),
    label: t.string(),
    role: t.string(),
    rig: t.string(),
  },
);

const events = table(
  { name: "events", public: true },
  {
    rowKey: t.string().primaryKey(),
    sessionId: t.string().index(),
    seq: t.u32(),
    id: t.string(),
    witnessId: t.string(),
    actor: t.string(),
    action: t.string(),
    fromAnchor: t.option(AnchorT),
    toAnchor: t.option(AnchorT),
    atAnchor: t.option(AnchorT),
    facing: t.option(t.string()),
    target: t.option(t.string()),
    prop: t.option(t.string()),
    tStart: t.f64(),
    tEnd: t.f64(),
    tConfidence: t.string(),
    confidence: t.f64(),
    sources: t.array(t.string()),
    status: t.string(),
    supersededBy: t.option(t.string()),
  },
);

const props = table(
  { name: "props", public: true },
  {
    rowKey: t.string().primaryKey(),
    sessionId: t.string().index(),
    seq: t.u32(),
    id: t.string(),
    type: t.string(),
    anchor: AnchorT,
    heldBy: t.option(t.string()),
    notes: t.string(),
    sources: t.array(t.string()),
  },
);

const patches = table(
  { name: "patches", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sessionId: t.string().index(),
    baseVersion: t.u32(),
    appliedVersion: t.u32(),
    op: t.string(),
    payload: t.string(),
    sources: t.array(t.string()),
    appliedAt: t.timestamp(),
  },
);

const flags = table(
  { name: "flags", public: true },
  {
    rowKey: t.string().primaryKey(),
    sessionId: t.string().index(),
    eventId: t.string().index(),
    seq: t.u32(),
    id: t.string(),
    check: t.string(),
    severity: t.string(),
    detail: t.string(),
    evidence: t.string(),
    conflictsWith: t.option(t.array(t.string())),
    suggestedQuestion: t.string(),
  },
);

const overrides = table(
  { name: "overrides", public: true },
  {
    rowKey: t.string().primaryKey(),
    sessionId: t.string().index(),
    eventId: t.string(),
    by: t.string(),
    sender: t.string(),
    reason: t.string(),
    at: t.f64(),
    flagIds: t.array(t.string()),
  },
);

export const HardFlagT = t.object("HardFlag", {
  id: t.string(),
  eventId: t.string(),
  check: t.string(),
  detail: t.string(),
  suggestedQuestion: t.string(),
});

export const extractionQueue = table(
  { name: "extraction_queue" },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    sessionId: t.string(),
    segmentId: t.string(),
  },
);

export const ExtractionT = t.object("Extraction", {
  segmentId: t.string(),
  patchCount: t.u32(),
  statuses: t.array(StatusEntryT),
  hardFlags: t.array(HardFlagT),
  error: t.option(t.string()),
});

export const spacetimedb = schema({
  sessions,
  segments,
  utterances,
  actors,
  events,
  props,
  patches,
  flags,
  overrides,
  extractionQueue,
}, {
  env: { ANTHROPIC_API_KEY: t.string(), CARTESIA_WEBHOOK_SECRET: t.string(), EDITOR_IDENTITIES: t.string() },
});

export { t };
