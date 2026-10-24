import { useEffect } from "react";
import { POV_KEY, PRESET_KEYS } from "./cameras/presets";
import { useSceneStore } from "./store";

const DEBUG_KEY = "`";

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

export function applyViewKey(key: string): boolean {
  const state = useSceneStore.getState();
  if (key === POV_KEY) {
    state.togglePov();
    return true;
  }
  const preset = PRESET_KEYS[key];
  if (!preset) return false;
  state.setPreset(preset);
  return true;
}

export function useSceneKeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (event.key === DEBUG_KEY) {
        useSceneStore.getState().toggleDebug();
        return;
      }
      applyViewKey(event.key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
