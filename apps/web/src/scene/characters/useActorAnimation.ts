import { useFrame } from "@react-three/fiber";
import type { SceneManifest } from "@rashomon/schema";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AnimationAction } from "three";
import { statusOf } from "../playback/useGraph";
import { useSceneStore } from "../store";
import { buildClipWindows, createClipSampler, EMPTY_WINDOW_SET } from "./blend";
import type { CharacterHandle } from "./Character";
import {
  clipRegistryVersion,
  cycleDistanceOf,
  getClip,
  loadClips,
  loadOptionalClips,
  subscribeClipRegistry,
} from "./clips";
import { poseActorFrame } from "./procedural/applyProcedural";
import { locomotionTimer } from "./procedural/locomotion";
import { rigFromCharacter } from "./procedural/proceduralRig";
import { proceduralSceneFor } from "./procedural/proceduralScene";

function useClipsLoaded(): boolean {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadClips()
      .then(() => {
        if (!cancelled) setLoaded(true);
      })
      .catch((error: unknown) => console.error("clip load failed", error));
    return () => {
      cancelled = true;
    };
  }, []);
  return loaded;
}

function useOptionalClipsSettled(): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadOptionalClips().then(() => {
      if (!cancelled) setSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return settled;
}

function hasClip(name: string): boolean {
  return getClip(name) !== undefined;
}

function durationOf(name: string): number | undefined {
  return getClip(name)?.duration;
}

export function useActorAnimation(
  actorId: string,
  character: CharacterHandle | null,
  manifest?: SceneManifest,
): void {
  const resolved = useSceneStore((state) => state.resolved);
  const graph = useSceneStore((state) => state.graph);
  const statuses = useSceneStore((state) => state.statuses);
  const events = resolved?.events;
  const clipsLoaded = useClipsLoaded();
  const optionalSettled = useOptionalClipsSettled();
  const registered = useSyncExternalStore(subscribeClipRegistry, clipRegistryVersion);
  const touched = useRef(new Map<string, AnimationAction>());
  const sampler = useMemo(createClipSampler, []);

  const windowSet = useMemo(
    () =>
      clipsLoaded && events
        ? buildClipWindows(actorId, events, hasClip, (event) => statusOf(statuses, event))
        : EMPTY_WINDOW_SET,
    [actorId, events, statuses, clipsLoaded, optionalSettled, registered],
  );

  const timeOf = useMemo(
    () => (clipsLoaded && events ? locomotionTimer(events, cycleDistanceOf) : undefined),
    [events, clipsLoaded],
  );
  const rig = useMemo(() => (character ? rigFromCharacter(character) : null), [character]);
  const scene = useMemo(
    () => (resolved ? proceduralSceneFor(resolved, statuses, graph, manifest, actorId) : null),
    [resolved, statuses, graph, manifest, actorId],
  );

  useEffect(() => {
    for (const sources of windowSet.conflicts) {
      console.warn(`actor ${actorId}: ${sources.join(", ")} overlap; rendering only the latest`);
    }
  }, [actorId, windowSet]);

  useEffect(() => {
    const actions = touched.current;
    return () => {
      for (const action of actions.values()) action.stop();
      actions.clear();
    };
  }, [character]);

  useFrame(() => {
    if (!character || !clipsLoaded) return;
    const { t } = useSceneStore.getState();
    poseActorFrame(
      {
        mixer: character.mixer,
        sampler,
        windowSet,
        durationOf,
        clipOf: getClip,
        actions: touched.current,
        timeOf,
        rig,
        scene,
      },
      t,
    );
  });
}
