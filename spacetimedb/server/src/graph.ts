import type { InferSchema, ReadonlyDbView } from "spacetimedb/server";
import type { GraphRow } from "./convert";
import type { spacetimedb } from "./tables";

export type ModuleSchema = InferSchema<typeof spacetimedb>;
export type ReadDb = ReadonlyDbView<ModuleSchema>;

const bySeq = <T extends { seq: number }>(a: T, b: T): number => a.seq - b.seq;

export function buildGraph(db: ReadDb, sessionId: string): GraphRow | undefined {
  const session = db.sessions.id.find(sessionId);
  if (!session) return undefined;

  const flagsByEvent = new Map<string, ReturnType<typeof flagRows>>();
  const flagRows = () => [...db.flags.sessionId.filter(sessionId)].sort(bySeq);
  for (const f of flagRows()) {
    const list = flagsByEvent.get(f.eventId) ?? [];
    list.push(f);
    flagsByEvent.set(f.eventId, list);
  }
  const overrides = new Map<string, ReturnType<ReadDb["overrides"]["rowKey"]["find"]>>();
  for (const o of db.overrides.sessionId.filter(sessionId)) overrides.set(o.eventId, o);

  return {
    sceneId: session.sceneId,
    version: session.version,
    actors: [...db.actors.sessionId.filter(sessionId)]
      .sort(bySeq)
      .map((a) => ({ id: a.id, label: a.label, role: a.role, rig: a.rig })),
    events: [...db.events.sessionId.filter(sessionId)].sort(bySeq).map((e) => {
      const o = overrides.get(e.id);
      return {
        id: e.id,
        witnessId: e.witnessId,
        actor: e.actor,
        action: e.action,
        from: e.fromAnchor,
        to: e.toAnchor,
        at: e.atAnchor,
        facing: e.facing,
        target: e.target,
        prop: e.prop,
        t: [e.tStart, e.tEnd],
        tConfidence: e.tConfidence,
        confidence: e.confidence,
        sources: e.sources,
        status: e.status,
        flags: (flagsByEvent.get(e.id) ?? []).map((f) => ({
          id: f.id,
          eventId: f.eventId,
          check: f.check,
          severity: f.severity,
          detail: f.detail,
          evidence: f.evidence,
          conflictsWith: f.conflictsWith,
          suggestedQuestion: f.suggestedQuestion,
        })),
        override: o && e.status === "overridden" ? { by: o.by, reason: o.reason, at: o.at, flagIds: o.flagIds } : undefined,
        supersededBy: e.supersededBy,
      };
    }),
    props: [...db.props.sessionId.filter(sessionId)].sort(bySeq).map((p) => ({
      id: p.id,
      type: p.type,
      anchor: p.anchor,
      heldBy: p.heldBy,
      notes: p.notes,
      sources: p.sources,
    })),
  };
}
