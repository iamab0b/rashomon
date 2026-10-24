import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { useSceneStore } from "./store";

const SAMPLE_WINDOW_MS = 500;

export function FpsProbe() {
  const setFps = useSceneStore((state) => state.setFps);
  const windowStart = useRef(performance.now());
  const frames = useRef(0);

  useFrame(() => {
    frames.current += 1;
    const now = performance.now();
    const elapsed = now - windowStart.current;
    if (elapsed < SAMPLE_WINDOW_MS) return;
    setFps(Math.round((frames.current * 1000) / elapsed));
    frames.current = 0;
    windowStart.current = now;
  });

  return null;
}
