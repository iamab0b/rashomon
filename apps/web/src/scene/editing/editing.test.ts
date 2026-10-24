import type { Event, Patch } from "@rashomon/schema";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { describe, expect, it, vi } from "vitest";
import { commitDrop } from "./commitDrop";
import { createDragSession } from "./dragSession";

const e5 = robberyGraph.events.find((event) => event.id === "e5") as Event;
const WINDOW: [number, number, number] = [4.5, 0, 1];

function deps(over: Partial<Parameters<typeof commitDrop>[2]> = {}) {
  return {
    manifest: storeScene,
    eventOf: (id: string) => (id === "e5" ? e5 : undefined),
    applyPatches: vi.fn<(patches: readonly Patch[]) => void>(),
    setActionError: vi.fn<(message: string | null) => void>(),
    ...over,
  };
}

describe("commitDrop", () => {
  it("sends the one update_event patch and clears the previous error first", () => {
    const given = deps();
    const outcome = commitDrop({ id: "e5", field: "at" }, WINDOW, given);

    expect(outcome.kind).toBe("sent");
    expect(given.applyPatches).toHaveBeenCalledTimes(1);
    expect(given.applyPatches).toHaveBeenCalledWith([
      {
        op: "update_event",
        id: "e5",
        changes: { at: { kind: "at", landmark: "window_front" } },
        sources: ["investigator:local"],
      },
    ]);
    expect(given.setActionError).toHaveBeenCalledWith(null);
  });

  it("sends nothing when the drop lands on the anchor the event already has", () => {
    const given = deps();
    const outcome = commitDrop({ id: "e5", field: "at" }, [1.5, 0, 3.5], given);

    expect(outcome.kind).toBe("unchanged");
    expect(given.applyPatches).not.toHaveBeenCalled();
  });

  it("keeps the thrown message for display and reports the failure", () => {
    const given = deps({
      applyPatches: vi.fn(() => {
        throw new Error("patch rejected: unknown event id e5");
      }),
    });

    const outcome = commitDrop({ id: "e5", field: "at" }, WINDOW, given);

    expect(outcome).toEqual({ kind: "failed", message: "patch rejected: unknown event id e5" });
    expect(given.setActionError).toHaveBeenLastCalledWith("patch rejected: unknown event id e5");
  });

  it("still sends a patch when the source cannot say what the event's anchor was", () => {
    const given = deps({ eventOf: () => undefined });

    expect(commitDrop({ id: "e5", field: "at" }, [1.5, 0, 3.5], given).kind).toBe("sent");
  });
});

describe("drag session", () => {
  it("returns the last point on end", () => {
    const session = createDragSession();
    session.start();
    session.move([1, 0, 1]);
    session.move([2, 0, 3]);

    expect(session.active()).toBe(true);
    expect(session.end()).toEqual([2, 0, 3]);
    expect(session.active()).toBe(false);
  });

  it("Escape during a drag cancels it: later moves are ignored and end gives no point", () => {
    const session = createDragSession();
    session.start();
    session.move([1, 0, 1]);

    expect(session.cancel()).toBe(true);
    session.move([5, 0, 5]);

    expect(session.active()).toBe(false);
    expect(session.end()).toBeNull();
    expect(session.cancel()).toBe(false);
  });

  it("a new drag after a cancelled one starts clean, and a drag with no move ends with no point", () => {
    const session = createDragSession();
    session.start();
    session.cancel();
    session.end();

    session.start();
    expect(session.end()).toBeNull();
    session.start();
    session.move([3, 0, 3]);
    expect(session.end()).toEqual([3, 0, 3]);
  });

  it("ignores moves and cancels when no drag is running", () => {
    const session = createDragSession();
    session.move([9, 0, 9]);
    expect(session.cancel()).toBe(false);
    expect(session.end()).toBeNull();
  });
});
