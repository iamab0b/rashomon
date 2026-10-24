import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AnimationAction } from "three";
import { useSceneStore } from "../store";
import { applySamples } from "./applySamples";
import { buildClipWindows, createClipSampler, EMPTY_WINDOW_SET } from "./blend";
import type { CharacterHandle } from "./Character";
import { getClip, loadClips } from "./clips";

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

function hasClip(name: string): boolean {
  return getClip(name) !== undefined;
}

function durationOf(name: string): number | undefined {
  return getClip(name)?.duration;
}

export function useActorAnimation(actorId: string, character: CharacterHandle | null): void {
  const events = useSceneStore((state) => state.resolved?.events);
  const clipsLoaded = useClipsLoaded();
  const touched = useRef(new Map<string, AnimationAction>());
  const sampler = useMemo(createClipSampler, []);

  const windowSet = useMemo(
    () => (clipsLoaded && events ? buildClipWindows(actorId, events, hasClip) : EMPTY_WINDOW_SET),
    [actorId, events, clipsLoaded],
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
    applySamples(character.mixer, sampler(windowSet, t, durationOf), getClip, touched.current);
  });
}
