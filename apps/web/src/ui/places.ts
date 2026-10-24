import type { Anchor, Event } from "@rashomon/schema";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import type { GraphMode } from "./graphMode";

type Vec3 = readonly [number, number, number];

type Landmark = { id: string; label: string; position: Vec3 };

export type EventAnchors = Pick<Event, "from" | "to" | "at">;

const LANDMARKS: Record<string, readonly Landmark[]> = {
  [storeScene.sceneId]: storeScene.landmarks,
};

const FIXTURE_EVENTS: Record<string, ReadonlyMap<string, Event>> = {
  [storeScene.sceneId]: new Map(robberyGraph.events.map((event) => [event.id, event])),
};

const round = (n: number) => Number(n.toFixed(1));

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function placeName(sceneId: string, id: string): string {
  return LANDMARKS[sceneId]?.find((landmark) => landmark.id === id)?.label ?? id.replace(/_/g, " ");
}

export function anchorsFor(
  mode: GraphMode,
  sceneId: string,
  event: Pick<Event, "id" | "actor" | "action">,
): EventAnchors | null {
  if (mode !== "fixture") return null;
  const source = FIXTURE_EVENTS[sceneId]?.get(event.id);
  return source && source.actor === event.actor && source.action === event.action ? source : null;
}

function anchorLabel(sceneId: string, anchor: Anchor, bare: boolean): string | null {
  const name = (id: string) => placeName(sceneId, id);
  switch (anchor.kind) {
    case "at": {
      const label = name(anchor.landmark);
      return bare || /^(behind|near|between|in|on|at)\b/i.test(label) ? label : `at ${label}`;
    }
    case "near":
      return `near ${name(anchor.landmark)}`;
    case "behind":
      return `behind ${name(anchor.landmark)}`;
    case "between":
      return `between ${name(anchor.a)} and ${name(anchor.b)}`;
    case "xyz":
      return null;
  }
}

export function eventPlace(
  sceneId: string,
  action: Event["action"],
  anchors: EventAnchors | null,
): string | null {
  if (!anchors) return null;
  if (anchors.from && anchors.to) {
    const from = anchorLabel(sceneId, anchors.from, true);
    const to = anchorLabel(sceneId, anchors.to, true);
    return from && to ? capitalize(`${from} → ${to}`) : null;
  }
  const anchor = anchors.at ?? anchors.to ?? anchors.from;
  if (!anchor) return null;
  if (action === "look") {
    const from = anchorLabel(sceneId, anchor, true);
    return from ? `From ${from}` : null;
  }
  const label = anchorLabel(sceneId, anchor, false);
  return label ? capitalize(label) : null;
}

export function eventCoordinates(event: { at?: Vec3; from?: Vec3; to?: Vec3 }): string | null {
  const point = (p: Vec3) => `(${round(p[0])}, ${round(p[2])})`;
  if (event.from && event.to) return `${point(event.from)} → ${point(event.to)}`;
  const only = event.at ?? event.to ?? event.from;
  return only ? point(only) : null;
}
