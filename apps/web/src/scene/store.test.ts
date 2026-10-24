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

describe("timeline state", () => {
  test("starts at t = 0, paused, with no resolved graph", () => {
    const state = useSceneStore.getState();

    expect(state.t).toBe(0);
    expect(state.playing).toBe(false);
    expect(state.resolved).toBeNull();
  });

  test("setT moves the playhead both forward and backward", () => {
    const { setT } = useSceneStore.getState();

    setT(12);
    expect(useSceneStore.getState().t).toBe(12);
    setT(3.5);
    expect(useSceneStore.getState().t).toBe(3.5);
  });

  test("setT clamps negative and non-finite values to 0", () => {
    const { setT } = useSceneStore.getState();

    setT(-2);
    expect(useSceneStore.getState().t).toBe(0);
    setT(Number.NaN);
    expect(useSceneStore.getState().t).toBe(0);
    setT(Number.POSITIVE_INFINITY);
    expect(useSceneStore.getState().t).toBe(0);
  });

  test("setPlaying and setResolved store their values", () => {
    const graph = { sceneId: "s", version: 1, durationS: 1, actors: [], events: [], props: [] };

    useSceneStore.getState().setPlaying(true);
    useSceneStore.getState().setResolved(graph);

    expect(useSceneStore.getState().playing).toBe(true);
    expect(useSceneStore.getState().resolved).toBe(graph);
  });
});

describe("timeline transport", () => {
  const graph = { sceneId: "s", version: 1, durationS: 24, actors: [], events: [], props: [] };

  test("duration follows resolved.durationS through setResolved and setGraph", () => {
    useSceneStore.getState().setResolved(graph);
    expect(useSceneStore.getState().duration).toBe(24);

    useSceneStore.getState().setGraph({ resolved: { ...graph, durationS: 12 }, statuses: { e1: "plausible" } });
    expect(useSceneStore.getState().duration).toBe(12);
    expect(useSceneStore.getState().statuses).toEqual({ e1: "plausible" });

    useSceneStore.getState().setGraph({ resolved: null, statuses: {} });
    expect(useSceneStore.getState().duration).toBe(0);
  });

  test("play and pause toggle playing without moving t", () => {
    useSceneStore.getState().setResolved(graph);
    useSceneStore.getState().setT(5);

    useSceneStore.getState().play();
    expect(useSceneStore.getState()).toMatchObject({ playing: true, t: 5 });
    useSceneStore.getState().pause();
    expect(useSceneStore.getState()).toMatchObject({ playing: false, t: 5 });
  });

  test("play at the end rewinds to 0", () => {
    useSceneStore.getState().setResolved(graph);
    useSceneStore.getState().setT(24);

    useSceneStore.getState().play();

    expect(useSceneStore.getState()).toMatchObject({ playing: true, t: 0 });
  });

  test("speed defaults to 1 and rejects non-positive values", () => {
    const { setSpeed } = useSceneStore.getState();
    expect(useSceneStore.getState().speed).toBe(1);

    setSpeed(2);
    expect(useSceneStore.getState().speed).toBe(2);
    setSpeed(0);
    expect(useSceneStore.getState().speed).toBe(1);
    setSpeed(Number.NaN);
    expect(useSceneStore.getState().speed).toBe(1);
  });
});
