import type { EventGraph, Patch } from "@rashomon/schema";

const mintId = (type: string, taken: Set<string>): string => {
  let n = 1;
  let id = `p_${type}`;
  while (taken.has(id)) {
    n += 1;
    id = `p_${type}_${n}`;
  }
  taken.add(id);
  return id;
};

export function mintPropIds(patches: Patch[], graph: Pick<EventGraph, "props">): Patch[] {
  const taken = new Set(graph.props.map((p) => p.id));
  const typeOf = new Map(graph.props.map((p) => [p.id, p.type]));
  const latestByType = new Map<string, string>();
  for (const p of graph.props) latestByType.set(p.type, p.id);

  const resolveRef = (ref: string | undefined): string | undefined => {
    if (ref === undefined || typeOf.has(ref)) return ref;
    return latestByType.get(ref) ?? ref;
  };

  return patches.map((patch): Patch => {
    if (patch.op === "add_prop") {
      const id = patch.prop.id ?? mintId(patch.prop.type, taken);
      taken.add(id);
      typeOf.set(id, patch.prop.type);
      latestByType.set(patch.prop.type, id);
      return { ...patch, prop: { ...patch.prop, id } };
    }
    if (patch.op === "add_event") {
      const prop = resolveRef(patch.event.prop);
      return prop === patch.event.prop ? patch : { ...patch, event: { ...patch.event, ...(prop !== undefined ? { prop } : {}) } };
    }
    if (patch.op === "update_event" && typeof patch.changes.prop === "string") {
      const prop = resolveRef(patch.changes.prop);
      return prop === patch.changes.prop ? patch : { ...patch, changes: { ...patch.changes, ...(prop !== undefined ? { prop } : {}) } };
    }
    return patch;
  });
}
