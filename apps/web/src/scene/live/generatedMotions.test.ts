import { describe, expect, test, vi } from "vitest";
import { DEFAULT_LIVE_OPTIONS, generatedMotionsQuery, type LiveConnector, type LiveHandlers } from "./liveConnection";
import { liveGraphSource } from "./liveGraphSource";

function connected() {
  let handlers: LiveHandlers | null = null;
  const connect: LiveConnector = (_options, given) => {
    handlers = given;
    return { disconnect: () => undefined, applyPatches: async () => undefined, submitStatement: async () => undefined };
  };
  const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, connect);
  const listener = vi.fn();
  source.subscribe(listener);
  if (!handlers) throw new Error("source did not connect");
  return { source, listener, handlers: handlers as LiveHandlers };
}

describe("live generated motions", () => {
  test("start empty", () => {
    expect(connected().source.generatedMotions()).toEqual([]);
  });

  test("a pending row, then its ready update, replace each other by verb and notify", () => {
    const { source, listener, handlers } = connected();

    handlers.onGeneratedMotion?.({ verb: "staggered", status: "pending" });
    handlers.onGeneratedMotion?.({ verb: "staggered", status: "ready", motionId: "mGen0001", characterId: "cXChar01" });
    handlers.onGeneratedMotion?.({ verb: "ducked", status: "failed" });

    expect(source.generatedMotions()).toEqual([
      { verb: "staggered", status: "ready", motionId: "mGen0001", characterId: "cXChar01" },
      { verb: "ducked", status: "failed" },
    ]);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  test("the subscription query quotes the session id", () => {
    expect(generatedMotionsQuery("o'brien")).toBe("SELECT * FROM generated_motions WHERE session_id = 'o''brien'");
  });
});
