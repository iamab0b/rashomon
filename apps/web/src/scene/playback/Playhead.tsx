import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { useSceneStore } from "../store";

const PLAYHEAD_PRIORITY = -1;

type Anchor = { t: number; clockS: number };

export function Playhead() {
  const anchor = useRef<Anchor | null>(null);

  useFrame(({ clock }) => {
    const { playing, t, setT } = useSceneStore.getState();
    if (!playing) {
      anchor.current = null;
      return;
    }
    if (!anchor.current) anchor.current = { t, clockS: clock.elapsedTime };
    setT(anchor.current.t + (clock.elapsedTime - anchor.current.clockS));
  }, PLAYHEAD_PRIORITY);

  return null;
}
