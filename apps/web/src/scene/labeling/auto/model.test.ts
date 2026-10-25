import { describe, expect, test, vi } from "vitest";
import { buildLandmarkRequest, LANDMARK_MODEL, NO_PROPOSALS, proposeLandmarks, TRUNCATED, type CallLandmarkModel } from "./model";
import type { LandmarkPayload } from "./payload";

const payload: LandmarkPayload = {
  images: ["/9j/AAAA", "/9j/BBBB", "/9j/CCCC"],
  candidates: [
    { id: "c1", size: [2, 0.9, 0.6] },
    { id: "c2", size: [1.2, 1.8, 0.4] },
  ],
};

const toolUse = (input: unknown) => ({ content: [{ type: "tool_use", id: "t1", name: "propose_landmarks", input }], stop_reason: "tool_use" });

describe("the landmark model call", () => {
  test("uses the extractor's call shape with the images and the candidate list", () => {
    const request = buildLandmarkRequest(payload);
    expect(request.model).toBe(LANDMARK_MODEL);
    expect(request.max_tokens).toBe(4000);
    expect(request.tool_choice).toEqual({ type: "auto" });
    expect(request.output_config).toEqual({ effort: "low" });
    const content = request.messages[0]!.content as Record<string, unknown>[];
    expect(content.filter((b) => b.type === "image")).toHaveLength(3);
    expect(content.at(-1)).toEqual({ type: "text", text: expect.stringContaining("c2: 1.20 x 1.80 x 0.40 m") });
    const system = JSON.stringify(request.system);
    expect(system).toMatch(/Never invent a candidate/);
    expect(system).toMatch(/label other when you are unsure/);
    expect(system).toMatch(/zone for floor areas a person stands in or walks through/);
  });

  test("returns validated proposals from the faked model", async () => {
    const callModel: CallLandmarkModel = vi.fn().mockResolvedValue(
      toolUse({
        proposals: [
          { candidate: "c1", label: "counter", kind: "occluder", occludes: true, confidence: 0.9, id: "counter" },
          { candidate: "c7", label: "shelf", kind: "occluder", occludes: true, confidence: 0.9, id: "shelf" },
        ],
      }),
    );
    const result = await proposeLandmarks(payload, callModel);
    expect(result).toEqual({
      ok: true,
      proposals: [{ candidate: "c1", label: "counter", kind: "occluder", occludes: true, confidence: 0.9, id: "counter" }],
      dropped: 1,
    });
  });

  test("retries once when there is no tool call, then gives up", async () => {
    const prose = { content: [{ type: "text", text: "I see a counter." }], stop_reason: "end_turn" };
    const retried = vi.fn<CallLandmarkModel>().mockResolvedValueOnce(prose).mockResolvedValueOnce(toolUse({ proposals: [] }));
    expect(await proposeLandmarks(payload, retried)).toEqual({ ok: true, proposals: [], dropped: 0 });
    expect(retried).toHaveBeenCalledTimes(2);
    const second = retried.mock.calls[1]![0];
    expect(second.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);

    const never = vi.fn<CallLandmarkModel>().mockResolvedValue(prose);
    expect(await proposeLandmarks(payload, never)).toEqual({ ok: false, error: NO_PROPOSALS });
    expect(never).toHaveBeenCalledTimes(2);

    const cut = vi.fn<CallLandmarkModel>().mockResolvedValue({ content: [], stop_reason: "max_tokens" });
    expect(await proposeLandmarks(payload, cut)).toEqual({ ok: false, error: TRUNCATED });
  });
});
