import { beforeEach, describe, expect, test } from "vitest";
import { useSceneStore } from "./store";

const initial = useSceneStore.getState();

beforeEach(() => {
  useSceneStore.setState(initial, true);
});

describe("scene store", () => {
  test("starts on the overview preset in loading state", () => {
    const state = useSceneStore.getState();

    expect(state.preset).toBe("overview");
    expect(state.status).toBe("loading");
    expect(state.debugVisible).toBe(false);
  });

  test("setPreset changes the preset", () => {
    useSceneStore.getState().setPreset("counter_close");

    expect(useSceneStore.getState().preset).toBe("counter_close");
  });

  test("re-selecting the active preset still bumps the reset counter", () => {
    const { setPreset } = useSceneStore.getState();
    setPreset("overview");
    const first = useSceneStore.getState().poseResetCount;

    setPreset("overview");

    expect(useSceneStore.getState().poseResetCount).toBe(first + 1);
    expect(useSceneStore.getState().preset).toBe("overview");
  });

  test("toggleDebug flips visibility", () => {
    const { toggleDebug } = useSceneStore.getState();

    toggleDebug();
    expect(useSceneStore.getState().debugVisible).toBe(true);
    toggleDebug();
    expect(useSceneStore.getState().debugVisible).toBe(false);
  });

  test("setFps, setFloorHit and setStatus store their values", () => {
    const state = useSceneStore.getState();

    state.setFps(60);
    state.setFloorHit([1, 0, 2]);
    state.setStatus("error");

    const next = useSceneStore.getState();
    expect(next.fps).toBe(60);
    expect(next.floorHit).toEqual([1, 0, 2]);
    expect(next.status).toBe("error");
    next.setFloorHit(null);
    expect(useSceneStore.getState().floorHit).toBeNull();
  });
});
