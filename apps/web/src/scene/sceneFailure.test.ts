import { afterEach, describe, expect, it } from "vitest";
import { selectSource } from "./playback/selectSource";
import { noGraphMessage, sceneFailure, shouldSignalReady, unknownFixtureMessage } from "./sceneFailure";
import { useSceneStore } from "./store";
import { callHook } from "./testing/hookHost";
import { useSceneStatus } from "./useSceneStatus";

const initial = useSceneStore.getState();

afterEach(() => {
  useSceneStore.setState(initial, true);
});

function fixtureFailure(search: string, fixture: string): string | null {
  return sceneFailure(fixture, search, selectSource(search, fixture) !== null);
}

describe("sceneFailure", () => {
  it("an unknown fixture names the fixture", () => {
    expect(fixtureFailure("?fixture=nope", "nope")).toBe('Unknown fixture "nope"');
    expect(unknownFixtureMessage("nope")).toBe('Unknown fixture "nope"');
    expect(fixtureFailure("", "constructor")).toBe('Unknown fixture "constructor"');
  });

  it("an unknown scenario on a known fixture names both", () => {
    expect(fixtureFailure("?scenario=x", "store")).toBe('No graph for fixture "store" and scenario "x"');
    expect(noGraphMessage("store", null)).toBe('No graph for fixture "store"');
  });

  it("an unknown fixture wins over the missing graph it also causes", () => {
    expect(selectSource("?scenario=x", "nope")).toBeNull();
    expect(fixtureFailure("?scenario=x", "nope")).toBe('Unknown fixture "nope"');
  });

  it("the default URL, the corrected scenario and live mode have no failure", () => {
    expect(fixtureFailure("", "store")).toBeNull();
    expect(fixtureFailure("?scenario=corrected", "store")).toBeNull();
    expect(fixtureFailure("?mode=live", "store")).toBeNull();
  });
});

describe("scene status in the store", () => {
  it("setStatus keeps the message next to an error and clears it otherwise", () => {
    const store = useSceneStore.getState();
    store.setStatus("error", 'Unknown fixture "nope"');
    expect(useSceneStore.getState().status).toBe("error");
    expect(useSceneStore.getState().error).toBe('Unknown fixture "nope"');

    store.setStatus("loading");
    expect(useSceneStore.getState().error).toBeNull();
    store.setStatus("error", "again");
    store.setStatus("ready");
    expect(useSceneStore.getState().status).toBe("ready");
    expect(useSceneStore.getState().error).toBeNull();
  });

  it("starts loading with no error", () => {
    expect(initial.status).toBe("loading");
    expect(initial.error).toBeNull();
  });

  it("useSceneStatus returns the status and the message", () => {
    expect(callHook(() => useSceneStatus())).toEqual({ status: "loading", error: null });

    useSceneStore.getState().setStatus("error", 'No graph for fixture "store" and scenario "x"');
    expect(callHook(() => useSceneStatus())).toEqual({
      status: "error",
      error: 'No graph for fixture "store" and scenario "x"',
    });
  });

  it("the default URL still reaches ready with no error", () => {
    const failure = fixtureFailure("", "store");
    expect(shouldSignalReady({ hasGraph: true, actorsReady: true, failure })).toBe(true);
    useSceneStore.getState().setStatus("ready");
    expect(callHook(() => useSceneStatus())).toEqual({ status: "ready", error: null });
  });

  it("a failure keeps the ready signal from overwriting the error", () => {
    const failure = fixtureFailure("?scenario=x", "store");
    expect(shouldSignalReady({ hasGraph: false, actorsReady: false, failure })).toBe(false);
    expect(shouldSignalReady({ hasGraph: true, actorsReady: true, failure })).toBe(false);
    expect(shouldSignalReady({ hasGraph: false, actorsReady: false, failure: null })).toBe(true);
    expect(shouldSignalReady({ hasGraph: true, actorsReady: false, failure: null })).toBe(false);
  });
});
