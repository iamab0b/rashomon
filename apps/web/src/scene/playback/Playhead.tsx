import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { useSceneStore } from "../store";
import { stepPlayhead, type PlayheadMemo } from "./playheadClock";

const PLAYHEAD_PRIORITY = -2;

export function Playhead() {
  const memo = useRef<PlayheadMemo | null>(null);

  useFrame(({ clock }) => {
    const state = useSceneStore.getState();
    const step = stepPlayhead(memo.current, {
      t: state.t,
      playing: state.playing,
      duration: state.duration > 0 ? state.duration : Number.POSITIVE_INFINITY,
      clockS: clock.elapsedTime,
      speed: state.speed,
    });
    memo.current = step.memo;
    if (!state.playing) return;
    if (step.t !== state.t) state.setT(step.t);
    if (!step.playing) state.setPlaying(false);
  }, PLAYHEAD_PRIORITY);

  return null;
}
