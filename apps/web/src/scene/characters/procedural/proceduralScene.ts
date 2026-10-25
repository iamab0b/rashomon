import type { ResolvedGraph, Vec3 } from "@rashomon/engine";
import rawProps from "@rashomon/props";
import type { EventGraph, SceneManifest } from "@rashomon/schema";
import { actorPosition, actorYaw, type ActorPlayback, type PositionLookup } from "../../playback/actorPose";
import { playbacksFor } from "../../playback/playbacks";
import { getPropType } from "../../props/library";
import { restBaseY } from "../../props/restHeight";
import { parseLibrary } from "../../props/types";
import type { StatusMap } from "../../store";
import { isPlayable } from "../blend";
import type { LookSource } from "./lookAt";
import type { PropRest, ReachSource } from "./reach";
import type { ActorFrame } from "./rigSpace";

const LIBRARY = parseLibrary(rawProps);

export type ProceduralScene = LookSource &
  ReachSource & {
    readonly playback: ActorPlayback;
  };

export function buildProceduralScene(
  playback: ActorPlayback,
  positionOf: PositionLookup,
  props: ReadonlyMap<string, PropRest>,
): ProceduralScene {
  const events = playback.events.filter((event) => isPlayable(playback.statusOf(event)));
  return { playback, positionOf, props, events };
}

export function propRests(
  resolved: Pick<ResolvedGraph, "props">,
  graph: Pick<EventGraph, "props"> | null,
  manifest: SceneManifest,
): ReadonlyMap<string, PropRest> {
  const anchors = new Map((graph?.props ?? []).map((prop) => [prop.id, prop.anchor]));
  return new Map(
    resolved.props.map((prop) => {
      const halfHeight = (getPropType(LIBRARY, prop.type)?.dimensionsM.h ?? 0) / 2;
      const baseY = restBaseY(anchors.get(prop.id), manifest, prop.position[1]);
      const point: Vec3 = [prop.position[0], baseY + halfHeight, prop.position[2]];
      return [prop.id, { prop, point }] as const;
    }),
  );
}

export function proceduralSceneFor(
  resolved: ResolvedGraph,
  statuses: StatusMap,
  graph: EventGraph | null,
  manifest: SceneManifest | undefined,
  actorId: string,
): ProceduralScene | null {
  const { byId, positionOf } = playbacksFor(resolved, statuses);
  const playback = byId.get(actorId);
  if (!playback) return null;
  return buildProceduralScene(playback, positionOf, manifest ? propRests(resolved, graph, manifest) : new Map());
}

export function actorFrameAt(scene: Pick<ProceduralScene, "playback" | "positionOf">, t: number): ActorFrame | null {
  const position = actorPosition(scene.playback, t);
  return position ? { position, yaw: actorYaw(scene.playback, t, scene.positionOf) } : null;
}
