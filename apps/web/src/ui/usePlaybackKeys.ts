import { useEffect, useRef } from "react";
import { spaceTogglesPlayback } from "./playback";

export function usePlaybackKeys(toggle: () => void): void {
  const latest = useRef(toggle);
  latest.current = toggle;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!spaceTogglesPlayback(event)) return;
      event.preventDefault();
      if (!event.repeat) latest.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
