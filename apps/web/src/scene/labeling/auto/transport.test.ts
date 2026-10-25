import { describe, expect, test, vi } from "vitest";
import { devTransport, SuggestError } from "./transport";

const payload = { images: ["/9j/AAAA", "/9j/AAAA", "/9j/AAAA"], candidates: [{ id: "c1", size: [1, 1, 1] as [number, number, number] }] };

describe("dev transport", () => {
  test("is unavailable without the dev route", () => {
    expect(devTransport(null)).toBeNull();
  });

  test("posts the payload and re-validates the proposals it gets back", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          proposals: [
            { candidate: "c1", label: "door", kind: "occluder", occludes: false, confidence: 0.7, id: "front_door" },
            { candidate: "c5", label: "door", kind: "occluder", occludes: false, confidence: 0.7, id: "back_door" },
          ],
          dropped: 0,
        }),
      ),
    );
    const transport = devTransport("/__landmarks", fetchImpl)!;
    const result = await transport(payload, new AbortController().signal);
    expect(result.proposals.map((p) => p.id)).toEqual(["front_door"]);
    expect(result.dropped).toBe(1);
    expect(fetchImpl.mock.calls[0]![0]).toBe("/__landmarks");
  });

  test("turns an error status into a short message", async () => {
    const transport = devTransport("/__landmarks", vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 503 })))!;
    await expect(transport(payload, new AbortController().signal)).rejects.toEqual(new SuggestError("The dev server has no ANTHROPIC_API_KEY"));
  });
});
