import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { useSceneStore } from "../store";
import { stepPlayhead, type PlayheadMemo } from "./playhead";

const PLAYHEAD_PRIORITY = -1;

export function Playhead() {
  const memo = useRef<PlayheadMemo | null>(null);

  useFrame(({ clock }) => {
    const state = useSceneStore.getState();
    const step = stepPlayhead(memo.current, {
      t: state.t,
      playing: state.playing,
      duration: state.resolved?.durationS ?? Number.POSITIVE_INFINITY,
      clockS: clock.elapsedTime,
    });
    memo.current = step.memo;
    if (!state.playing) return;
    if (step.t !== state.t) state.setT(step.t);
    if (!step.playing) state.setPlaying(false);
  }, PLAYHEAD_PRIORITY);

  return null;
}
