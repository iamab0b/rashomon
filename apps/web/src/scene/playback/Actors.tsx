import type { ResolvedEvent } from "@rashomon/engine";
import type { SceneManifest } from "@rashomon/schema";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadClips } from "../characters/clips";
import type { Rig } from "../characters/rigs";
import { useSceneStore } from "../store";
import { ActorRig } from "./ActorRig";
import { actorPosition, buildActorPlayback, ghostAnchor, type ActorPlayback, type PositionLookup } from "./actorPose";
import { disagreementEvents, layerColor, markerShown, witnessLayers } from "./witnessLayers";
import { Ghost } from "./Ghost";
import { statusOf } from "./useGraph";

const RIGS: ReadonlySet<string> = new Set<Rig>(["mixamo_ybot", "mixamo_xbot"]);

function asRig(value: string): Rig | null {
  return RIGS.has(value) ? (value as Rig) : null;
}

type DrawnActor = { playback: ActorPlayback; rig: Rig };
type DrawnGhost = { event: ResolvedEvent; rig: Rig };
type DrawnMarker = { event: ResolvedEvent; rig: Rig; playback: ActorPlayback; color: string };

function useClipsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadClips()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((error: unknown) => console.error("clip load failed", error));
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}

type Props = { manifest?: SceneManifest };

export function Actors({ manifest }: Props = {}) {
  const resolved = useSceneStore((state) => state.resolved);
  const statuses = useSceneStore((state) => state.statuses);
  const setActorsReady = useSceneStore((state) => state.setActorsReady);
  const clipsReady = useClipsReady();
  const [readyIds, setReadyIds] = useState<ReadonlySet<string>>(() => new Set());

  const lookup = useCallback((event: ResolvedEvent) => statusOf(statuses, event), [statuses]);

  const actors = useMemo<DrawnActor[]>(() => {
    if (!resolved) return [];
    return resolved.actors.flatMap((actor) => {
      const rig = asRig(actor.rig);
      if (!rig) {
        console.warn(`actor ${actor.id} has unknown rig ${actor.rig}; not drawn`);
        return [];
      }
      const playback = buildActorPlayback(resolved, actor.id, lookup);
      return playback.events.length > 0 ? [{ playback, rig }] : [];
    });
  }, [resolved, lookup]);

  const positionOf = useMemo<PositionLookup>(() => {
    const byId = new Map(actors.map(({ playback }) => [playback.actorId, playback]));
    return (actorId, t) => {
      const playback = byId.get(actorId);
      return playback ? actorPosition(playback, t) : null;
    };
  }, [actors]);

  const ghosts = useMemo<DrawnGhost[]>(() => {
    if (!resolved) return [];
    return resolved.events.flatMap((event) => {
      if (lookup(event) !== "implausible" || !ghostAnchor(event)) return [];
      const rig = asRig(resolved.actors.find((actor) => actor.id === event.actor)?.rig ?? "");
      return rig ? [{ event, rig }] : [];
    });
  }, [resolved, lookup]);

  const graph = useSceneStore((state) => state.graph);

  const markers = useMemo<DrawnMarker[]>(() => {
    if (!resolved) return [];
    const layers = witnessLayers(graph, resolved);
    return disagreementEvents(resolved, lookup).flatMap((event) => {
      const drawn = actors.find(({ playback }) => playback.actorId === event.actor);
      return drawn && ghostAnchor(event)
        ? [{ event, rig: drawn.rig, playback: drawn.playback, color: layerColor(layers, event.witnessId) }]
        : [];
    });
  }, [resolved, graph, lookup, actors]);

  const markReady = useCallback((id: string) => {
    setReadyIds((current) => (current.has(id) ? current : new Set([...current, id])));
  }, []);

  useEffect(() => {
    const expected = [
      ...actors.map(({ playback }) => playback.actorId),
      ...ghosts.map(({ event }) => event.id),
      ...markers.map(({ event }) => `marker:${event.id}`),
    ];
    setActorsReady(clipsReady && expected.every((id) => readyIds.has(id)));
  }, [actors, ghosts, markers, readyIds, clipsReady, setActorsReady]);

  useEffect(() => () => setActorsReady(false), [setActorsReady]);

  return (
    <>
      {actors.map(({ playback, rig }) => (
        <ActorRig
          key={playback.actorId}
          playback={playback}
          rig={rig}
          positionOf={positionOf}
          manifest={manifest}
          onReady={markReady}
        />
      ))}
      {ghosts.map(({ event, rig }) => (
        <Ghost key={event.id} event={event} rig={rig} positionOf={positionOf} onReady={markReady} />
      ))}
      {markers.map(({ event, rig, playback, color }) => (
        <Ghost
          key={`marker:${event.id}`}
          event={event}
          rig={rig}
          positionOf={positionOf}
          onReady={markReady}
          readyId={`marker:${event.id}`}
          color={color}
          badge={false}
          shownAt={(t) => markerShown(playback, event, t)}
        />
      ))}
    </>
  );
}
