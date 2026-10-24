import type { Event, EventGraph, Patch, PropInstance } from "@rashomon/schema";

const nextNumber = (ids: string[], prefix: string): number =>
  ids.reduce((max, id) => {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(id);
    return m && m[1] ? Math.max(max, Number(m[1])) : max;
  }, 0) + 1;

export function applyPatchesLocal(
  graph: EventGraph,
  patches: Patch[],
): EventGraph {
  const events: Event[] = graph.events.map((e) => ({ ...e }));
  const props: PropInstance[] = graph.props.map((p) => ({ ...p }));
  const actors = [...graph.actors];

  for (const p of patches) {
    if (p.op === "add_actor" && !actors.some((a) => a.id === p.actor.id))
      actors.push(p.actor);
    if (p.op === "add_prop") {
      const n = nextNumber(
        props.map((x) => x.id),
        "p",
      );
      props.push({ ...p.prop, id: `p${n}` });
    }
  }

  const resolveProp = (ref: string | undefined): string | undefined => {
    if (ref === undefined) return undefined;
    if (props.some((x) => x.id === ref)) return ref;
    const byType = [...props].reverse().find((x) => x.type === ref);
    return byType ? byType.id : ref;
  };

  for (const p of patches) {
    if (p.op === "add_event") {
      const n = nextNumber(
        events.map((e) => e.id),
        "e",
      );
      const event: Event = {
        ...p.event,
        id: `e${n}`,
        status: "proposed",
        flags: [],
      };
      const prop = resolveProp(event.prop);
      if (prop !== undefined) event.prop = prop;
      events.push(event);
    }
    if (p.op === "update_event") {
      const i = events.findIndex((e) => e.id === p.id);
      const cur = events[i];
      if (cur) {
        const changes = { ...p.changes };
        const prop = resolveProp(changes.prop);
        if (prop !== undefined) changes.prop = prop;
        events[i] = {
          ...cur,
          ...changes,
          sources: [...new Set([...cur.sources, ...p.sources])],
        };
      }
    }
    if (p.op === "retract_event") {
      const i = events.findIndex((e) => e.id === p.id);
      const cur = events[i];
      if (cur) events[i] = { ...cur, status: "superseded" };
    }
    if (p.op === "update_prop") {
      const i = props.findIndex((x) => x.id === p.id);
      const cur = props[i];
      if (cur)
        props[i] = {
          ...cur,
          ...p.changes,
          sources: [...new Set([...cur.sources, ...p.sources])],
        };
    }
  }

  return { ...graph, actors, events, props, version: graph.version + 1 };
}
