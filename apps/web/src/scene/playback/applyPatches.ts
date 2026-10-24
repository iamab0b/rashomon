import type { Actor, Event, EventGraph, Patch, PropInstance, SceneManifest } from "@rashomon/schema";
import { storeScene } from "@rashomon/schema/fixtures";
import { gatedSnapshot } from "./gatedSnapshot";

const MIN_OVERRIDE_REASON_LENGTH = 10;
const EVENT_KEYS_PATCHES_CANNOT_WRITE: ReadonlySet<string> = new Set(["id", "status", "flags", "override", "sources"]);
const EVENT_KEYS_ADD_CANNOT_CARRY: ReadonlySet<string> = new Set(["status", "flags", "override", "supersededBy"]);
const EVENT_KEYS_REQUIRED: ReadonlySet<string> = new Set(["witnessId", "actor", "action", "t", "tConfidence", "confidence"]);
const PROP_KEYS_PATCHES_CANNOT_WRITE: ReadonlySet<string> = new Set(["id", "sources"]);
const PROP_KEYS_REQUIRED: ReadonlySet<string> = new Set(["type", "anchor", "notes"]);

type OverridePatch = Extract<Patch, { op: "override" }>;

function nextId(ids: readonly string[], prefix: string): string {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  const highest = ids.reduce((max, id) => {
    const match = pattern.exec(id);
    return match?.[1] ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}${highest + 1}`;
}

function carriedId(value: object): string | undefined {
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function mintId(value: object, existing: readonly string[], prefix: string, kind: string): string {
  const id = carriedId(value) ?? nextId(existing, prefix);
  if (existing.includes(id)) throw new Error(`patch rejected: ${kind} id ${id} already exists`);
  return id;
}

function appendSources(current: readonly string[], added: readonly string[]): string[] {
  return [...new Set([...current, ...added])];
}

function without<T extends object>(value: T, keys: ReadonlySet<string>): T {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.has(key))) as T;
}

function changedSources(changes: object): string[] {
  const sources = (changes as { sources?: unknown }).sources;
  return Array.isArray(sources) ? sources.filter((source): source is string => typeof source === "string") : [];
}

function merge<T extends object>(base: T, changes: object, blocked: ReadonlySet<string>, required: ReadonlySet<string>): T {
  const entries = Object.entries(changes).filter(([key, value]) => !blocked.has(key) && value !== undefined);
  const clearedRequired = entries.find(([key, value]) => value === null && required.has(key));
  if (clearedRequired) throw new Error(`patch rejected: ${clearedRequired[0]} is required and cannot be cleared`);
  const cleared = new Set(entries.filter(([, value]) => value === null).map(([key]) => key));
  const kept = Object.entries(base).filter(([key]) => !cleared.has(key));
  const written = entries.filter(([key]) => !cleared.has(key));
  return Object.fromEntries([...kept, ...written]) as T;
}

function replaceById<T extends { id: string }>(items: readonly T[], id: string, kind: string, edit: (item: T) => T): T[] {
  if (!items.some((item) => item.id === id)) throw new Error(`patch rejected: unknown ${kind} id ${id}`);
  return items.map((item) => (item.id === id ? edit(item) : item));
}

function addEvent(graph: EventGraph, draft: Omit<Event, "id" | "status" | "flags">): EventGraph {
  const id = mintId(draft, graph.events.map((event) => event.id), "e", "event");
  const event: Event = { ...without(draft, EVENT_KEYS_ADD_CANNOT_CARRY), id, status: "proposed", flags: [] };
  return { ...graph, events: [...graph.events, event] };
}

function updateEvent(graph: EventGraph, id: string, changes: object, sources: readonly string[]): EventGraph {
  const events = replaceById(graph.events, id, "event", (event) => {
    const merged = merge(event, changes, EVENT_KEYS_PATCHES_CANNOT_WRITE, EVENT_KEYS_REQUIRED);
    return { ...merged, sources: appendSources(merged.sources, [...changedSources(changes), ...sources]) };
  });
  return { ...graph, events };
}

function retractEvent(graph: EventGraph, id: string, sources: readonly string[]): EventGraph {
  const [retractingSource] = sources;
  if (!retractingSource) throw new Error(`patch rejected: retract_event on ${id} needs a retracting source`);
  const events = replaceById(graph.events, id, "event", (event) => ({
    ...event,
    supersededBy: retractingSource,
    sources: appendSources(event.sources, sources),
  }));
  return { ...graph, events };
}

function addProp(graph: EventGraph, draft: Omit<PropInstance, "id">): EventGraph {
  const id = mintId(draft, graph.props.map((prop) => prop.id), "p", "prop");
  return { ...graph, props: [...graph.props, { ...draft, id }] };
}

function updateProp(graph: EventGraph, id: string, changes: object, sources: readonly string[]): EventGraph {
  const props = replaceById(graph.props, id, "prop", (prop) => {
    const merged = merge(prop, changes, PROP_KEYS_PATCHES_CANNOT_WRITE, PROP_KEYS_REQUIRED);
    return { ...merged, sources: appendSources(merged.sources, [...changedSources(changes), ...sources]) };
  });
  return { ...graph, props };
}

function addActor(graph: EventGraph, actor: Actor): EventGraph {
  if (graph.actors.some((existing) => existing.id === actor.id)) return graph;
  return { ...graph, actors: [...graph.actors, { ...actor }] };
}

function override(graph: EventGraph, patch: OverridePatch, now: number, manifest: SceneManifest): EventGraph {
  if (patch.reason.trim().length < MIN_OVERRIDE_REASON_LENGTH) {
    throw new Error(
      `override of ${patch.id} rejected: an override needs a reason of at least ${MIN_OVERRIDE_REASON_LENGTH} characters`,
    );
  }
  if (!graph.events.some((event) => event.id === patch.id)) {
    throw new Error(`override of ${patch.id} rejected: unknown event id ${patch.id}`);
  }
  const gatedEvent = gatedSnapshot(graph, manifest).resolved?.events.find((event) => event.id === patch.id);
  if (gatedEvent?.status !== "implausible") {
    throw new Error(
      `override of ${patch.id} rejected: only an event the gate marks implausible can be overridden (gate says ${gatedEvent?.status ?? "nothing"})`,
    );
  }
  const flagIds = gatedEvent.flags.filter((flag) => flag.severity === "hard").map((flag) => flag.id);
  const events = graph.events.map((event) =>
    event.id === patch.id ? { ...event, override: { by: patch.by, reason: patch.reason, at: now, flagIds } } : event,
  );
  return { ...graph, events };
}

function applyPatch(graph: EventGraph, patch: Patch, now: number, manifest: SceneManifest): EventGraph {
  switch (patch.op) {
    case "add_event":
      return addEvent(graph, patch.event);
    case "update_event":
      return updateEvent(graph, patch.id, patch.changes, patch.sources);
    case "retract_event":
      return retractEvent(graph, patch.id, patch.sources);
    case "add_prop":
      return addProp(graph, patch.prop);
    case "update_prop":
      return updateProp(graph, patch.id, patch.changes, patch.sources);
    case "add_actor":
      return addActor(graph, patch.actor);
    case "override":
      return override(graph, patch, now, manifest);
  }
}

export function applyPatches(
  graph: EventGraph,
  patches: readonly Patch[],
  now: number,
  manifest: SceneManifest = storeScene,
): EventGraph {
  if (graph.sceneId !== manifest.sceneId) {
    throw new Error(`patch rejected: graph ${graph.sceneId} cannot be gated against manifest ${manifest.sceneId}`);
  }
  return patches.reduce((current, patch) => applyPatch(current, patch, now, manifest), graph);
}
