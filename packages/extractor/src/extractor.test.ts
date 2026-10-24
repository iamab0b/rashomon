import { describe, expect, test } from "vitest";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import propsJson from "../../props/props.json";
import transcriptJson from "../fixtures/robbery.transcript.json";
import correctionJson from "../fixtures/robbery.correction.json";
import type { EventGraph, PropType, Segment } from "@rashomon/schema";
import {
  applyPatchesLocal,
  buildRequest,
  isPatchList,
  compareToFixture,
  extractSegment,
  resolveLandmarkId,
  validateToolUses,
} from "./index";
import type {
  CallModel,
  ExtractContext,
  ModelResponse,
  ToolUseBlock,
} from "./index";

const store = storeScene;
const expected = robberyGraph;
const propTypes = propsJson as unknown as PropType[];
const transcript = transcriptJson as Segment[];
const correction = correctionJson as Segment[];

const baseCtx = (): ExtractContext => ({
  landmarks: store.landmarks,
  actors: expected.actors,
  propTypes,
  events: [],
  props: [],
  recentSegments: [],
});

const utt = (id: string): Segment => {
  const s = [...transcript, ...correction].find((x) => x.id === id);
  if (!s) throw new Error(`no segment ${id}`);
  return s;
};

const use = (
  name: string,
  input: Record<string, unknown>,
  id = `tu_${name}`,
): ToolUseBlock => ({ type: "tool_use", id, name, input });

const at = (landmark: string) => ({
  kind: "at",
  landmark,
  second_landmark: null,
  radius_m: null,
});

const walkInput = (over: Record<string, unknown> = {}) => ({
  actor: "suspect",
  action: "walk",
  from: at("front_door"),
  to: { kind: "near", landmark: "counter", second_landmark: null, radius_m: 0.6 },
  at: null,
  facing: null,
  target: null,
  prop: null,
  t_start: 0,
  t_end: 5,
  t_confidence: "inferred",
  confidence: "high",
  sources: ["utt_2"],
  ...over,
});

describe("resolveLandmarkId", () => {
  test("accepts ids, labels and aliases", () => {
    expect(resolveLandmarkId("counter", store.landmarks)).toBe("counter");
    expect(resolveLandmarkId("Chips Aisle", store.landmarks)).toBe("aisle_chips");
    expect(resolveLandmarkId("the first aisle", store.landmarks)).toBe(
      "aisle_chips",
    );
    expect(resolveLandmarkId("the moon", store.landmarks)).toBeNull();
  });
});

describe("validateToolUses", () => {
  test("maps confidence to numbers and keeps the segment as a source", () => {
    const [r] = validateToolUses(
      [use("add_event", walkInput({ sources: [] }))],
      utt("utt_2"),
      baseCtx(),
    );
    expect(r?.error).toBeUndefined();
    const p = r?.patches[0];
    expect(p?.op).toBe("add_event");
    if (p?.op !== "add_event") return;
    expect(p.event.confidence).toBe(0.9);
    expect(p.event.sources).toEqual(["utt_2"]);
    expect(p.event.witnessId).toBe("w1");
    expect(p.event.t).toEqual([0, 5]);
    expect(p.event.to).toEqual({ kind: "near", landmark: "counter", radiusM: 0.6 });
  });

  test("maps an alias to its landmark id", () => {
    const [r] = validateToolUses(
      [use("add_event", walkInput({ from: at("the entrance") }))],
      utt("utt_2"),
      baseCtx(),
    );
    const p = r?.patches[0];
    if (p?.op !== "add_event") throw new Error("expected add_event");
    expect(p.event.from).toEqual({ kind: "at", landmark: "front_door" });
  });

  test("rejects unknown landmarks, actors, bad times and invented sources", () => {
    const results = validateToolUses(
      [
        use("add_event", walkInput({ to: at("the moon") }), "a"),
        use("add_event", walkInput({ actor: "ghost" }), "b"),
        use("add_event", walkInput({ t_start: 6, t_end: 2 }), "c"),
        use("add_event", walkInput({ sources: ["utt_99"] }), "d"),
      ],
      utt("utt_2"),
      baseCtx(),
    );
    expect(results.map((r) => r.error !== undefined)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    const d = results[3]?.patches[0];
    if (d?.op !== "add_event") throw new Error("expected add_event");
    expect(d.event.sources).toEqual(["utt_2"]);
  });

  test("never produces xyz anchors", () => {
    const [r] = validateToolUses(
      [
        use(
          "add_event",
          walkInput({ to: { kind: "xyz", landmark: "counter" } }),
        ),
      ],
      utt("utt_2"),
      baseCtx(),
    );
    expect(r?.error).toContain("kind");
  });

  test("update_event needs an existing id and at least one change", () => {
    const ctx = { ...baseCtx(), events: expected.events };
    const results = validateToolUses(
      [
        use(
          "update_event",
          {
            id: "e5",
            action: null,
            from: null,
            to: null,
            at: at("window_front"),
            facing: null,
            target: null,
            prop: null,
            t_start: null,
            t_end: null,
            sources: ["utt_12"],
          },
          "a",
        ),
        use(
          "update_event",
          {
            id: "e99",
            action: null,
            from: null,
            to: null,
            at: at("window_front"),
            facing: null,
            target: null,
            prop: null,
            t_start: null,
            t_end: null,
            sources: [],
          },
          "b",
        ),
        use(
          "update_event",
          {
            id: "e5",
            action: null,
            from: null,
            to: null,
            at: null,
            facing: null,
            target: null,
            prop: null,
            t_start: null,
            t_end: null,
            sources: [],
          },
          "c",
        ),
      ],
      utt("utt_12"),
      ctx,
    );
    expect(results.map((r) => r.error !== undefined)).toEqual([false, true, true]);
    const p = results[0]?.patches[0];
    if (p?.op !== "update_event") throw new Error("expected update_event");
    expect(p.changes).toEqual({ at: { kind: "at", landmark: "window_front" } });
  });

  test("a new prop and an event using it in the same turn validate", () => {
    const results = validateToolUses(
      [
        use("add_prop", {
          type: "knife_chef",
          anchor: at("counter"),
          held_by: "suspect",
          notes: "maybe eight inches",
          sources: [],
        }),
        use(
          "add_event",
          walkInput({
            action: "pick_up",
            from: null,
            to: null,
            at: at("counter"),
            prop: "knife_chef",
          }),
        ),
      ],
      utt("utt_5"),
      baseCtx(),
    );
    expect(results.every((r) => r.error === undefined)).toBe(true);
  });

  test("add_prop without an anchor is rejected", () => {
    const [r] = validateToolUses(
      [
        use("add_prop", {
          type: "knife_chef",
          anchor: null,
          held_by: null,
          notes: "",
          sources: [],
        }),
      ],
      utt("utt_5"),
      baseCtx(),
    );
    expect(r?.error).toContain("anchor");
  });

  test("no_events produces no patches and no error", () => {
    const [r] = validateToolUses(
      [use("no_events", { reason: "appearance only" })],
      utt("utt_7"),
      baseCtx(),
    );
    expect(r?.patches).toEqual([]);
    expect(r?.error).toBeUndefined();
  });
});

describe("buildRequest", () => {
  test("lists every landmark, actor and prop type and caches the system prompt", () => {
    const req = buildRequest(utt("utt_1"), baseCtx());
    const text = JSON.stringify(req.messages);
    for (const l of store.landmarks) expect(text).toContain(l.id);
    for (const a of expected.actors) expect(text).toContain(a.id);
    for (const p of propTypes) expect(text).toContain(p.type);
    expect(req.system[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(req.tools.map((t) => t.name)).toContain("no_events");
  });
});

describe("extractSegment", () => {
  test("skips interviewer and agent segments without calling the model", async () => {
    let calls = 0;
    const model: CallModel = async () => {
      calls++;
      return { content: [] };
    };
    const r = await extractSegment(utt("agent_1"), baseCtx(), model);
    expect(calls).toBe(0);
    expect(r.skipped).toBeDefined();
    expect(r.patches).toEqual([]);
  });

  test("retries once with the error and keeps the patches that were fine", async () => {
    const requests: number[] = [];
    const model: CallModel = async (req): Promise<ModelResponse> => {
      requests.push(req.messages.length);
      if (requests.length === 1)
        return {
          content: [
            use("add_event", walkInput(), "ok"),
            use("add_event", walkInput({ to: at("the moon") }), "bad"),
          ],
        };
      const last = req.messages[req.messages.length - 1];
      expect(JSON.stringify(last)).toContain("Rejected");
      expect(JSON.stringify(last)).toContain("Accepted");
      return {
        content: [use("add_event", walkInput({ to: at("counter") }), "fixed")],
      };
    };
    const r = await extractSegment(utt("utt_2"), baseCtx(), model);
    expect(r.attempts).toBe(2);
    expect(r.patches).toHaveLength(2);
    expect(r.unparsed).toEqual([]);
    expect(requests).toEqual([1, 3]);
  });

  test("gives up after the retry and reports what could not be parsed", async () => {
    const model: CallModel = async () => ({
      content: [use("add_event", walkInput({ to: at("the moon") }))],
    });
    const r = await extractSegment(utt("utt_2"), baseCtx(), model);
    expect(r.attempts).toBe(2);
    expect(r.patches).toEqual([]);
    expect(r.unparsed).toHaveLength(1);
  });
});

describe("applyPatchesLocal and compareToFixture", () => {
  test("a hand-written patch list for utt_2 grows the graph and resolves props by type", () => {
    const results = validateToolUses(
      [
        use("add_prop", {
          type: "knife_chef",
          anchor: at("counter"),
          held_by: "suspect",
          notes: "maybe eight inches",
          sources: [],
        }),
        use(
          "add_event",
          walkInput({
            action: "pick_up",
            from: null,
            to: null,
            at: at("counter"),
            prop: "knife_chef",
          }),
        ),
      ],
      utt("utt_5"),
      baseCtx(),
    );
    const start: EventGraph = {
      sceneId: "store_v1",
      actors: expected.actors,
      events: [],
      props: [],
      version: 0,
    };
    const g = applyPatchesLocal(
      start,
      results.flatMap((r) => r.patches),
    );
    expect(g.events).toHaveLength(1);
    expect(g.events[0]?.id).toBe("e1");
    expect(g.events[0]?.status).toBe("proposed");
    expect(g.props[0]?.id).toBe("p1");
    expect(g.events[0]?.prop).toBe("p1");
    expect(g.version).toBe(1);
  });

  test("the fixture graph matches itself", () => {
    const c = compareToFixture(expected, expected);
    expect(c.matched).toBe(10);
    expect(c.missing).toEqual([]);
    expect(c.extras).toEqual([]);
  });
});

describe("isPatchList on validated extractor output", () => {
  test("every patch the validator emits passes the Patch[] guard", () => {
    const results = validateToolUses(
      [
        use("add_actor", { id: "bystander", label: "Bystander", role: "other" }),
        use("add_prop", {
          type: "knife_chef",
          anchor: { kind: "behind", landmark: "counter", second_landmark: null, radius_m: null },
          held_by: "suspect",
          notes: "maybe eight inches",
          sources: [],
        }),
        use("add_event", walkInput()),
      ],
      utt("utt_2"),
      baseCtx(),
    );
    const patches = results.flatMap((r) => r.patches);
    expect(patches).toHaveLength(3);
    expect(isPatchList(patches)).toBe(true);
  });

  test("the guard rejects empty sources, odd confidence and coordinates-free junk", () => {
    const [r] = validateToolUses(
      [use("add_event", walkInput())],
      utt("utt_2"),
      baseCtx(),
    );
    const good = r?.patches[0];
    if (good?.op !== "add_event") throw new Error("expected add_event");
    expect(isPatchList([good])).toBe(true);
    expect(isPatchList([{ ...good, event: { ...good.event, sources: [] } }])).toBe(false);
    expect(isPatchList([{ ...good, event: { ...good.event, confidence: 0.5 } }])).toBe(false);
    expect(isPatchList([{ op: "teleport" }])).toBe(false);
  });
});
