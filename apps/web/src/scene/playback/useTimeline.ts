import { useSceneStore } from "../store";

export type TimelineApi = {
  t: number;
  playing: boolean;
  speed: number;
  duration: number;
  setT: (t: number) => void;
  play: () => void;
  pause: () => void;
};

export function useTimeline(): TimelineApi {
  const t = useSceneStore((state) => state.t);
  const playing = useSceneStore((state) => state.playing);
  const speed = useSceneStore((state) => state.speed);
  const duration = useSceneStore((state) => state.duration);
  const setT = useSceneStore((state) => state.setT);
  const play = useSceneStore((state) => state.play);
  const pause = useSceneStore((state) => state.pause);
  return { t, playing, speed, duration, setT, play, pause };
}
