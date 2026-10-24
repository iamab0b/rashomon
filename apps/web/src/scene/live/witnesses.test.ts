import { describe, expect, it } from "vitest";
import { convertGraphRow, type LiveGraphRow } from "./convert";

const row = (witnesses: { id: string; label: string; actorId?: string }[] | undefined): LiveGraphRow =>
  ({ sceneId: "store_v1", actors: [], events: [], props: [], version: 2, witnesses }) as unknown as LiveGraphRow;

describe("convertGraphRow witnesses", () => {
  it("carries the witnesses the module serves, dropping an absent actorId", () => {
    const graph = convertGraphRow(row([{ id: "w1", label: "w1" }, { id: "w2", label: "Clerk", actorId: "clerk" }]));
    expect(graph.witnesses).toEqual([{ id: "w1", label: "w1" }, { id: "w2", label: "Clerk", actorId: "clerk" }]);
  });

  it("leaves witnesses out when the row has none", () => {
    expect(convertGraphRow(row(undefined))).not.toHaveProperty("witnesses");
  });
});
