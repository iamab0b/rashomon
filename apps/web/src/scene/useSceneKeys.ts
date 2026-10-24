import { useEffect } from "react";
import { PRESET_KEYS } from "./cameras/presets";
import { useSceneStore } from "./store";

const DEBUG_KEY = "`";

export function useSceneKeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const state = useSceneStore.getState();
      if (event.key === DEBUG_KEY) {
        state.toggleDebug();
        return;
      }
      const preset = PRESET_KEYS[event.key];
      if (preset) state.setPreset(preset);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
