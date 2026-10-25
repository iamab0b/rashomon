import type { ToolUseBlock } from "@rashomon/extractor";
import { at, NONE, normalizeStatement, use, type RecordedStatements } from "./recordedStatements";

export const STAIRWELL_NOTE = "fixture mode only understands the stairwell's statements";

export const STAIRWELL_CLAIM_TEXT =
  "I was at the top of the stairs. He was standing by the south window, and I saw him there for a couple of seconds.";

export const STAIRWELL_CORRECTION_TEXT = "Oh. No, I'd stepped over to the west window by then. I saw him from there.";

const event = (fields: Record<string, unknown>) => ({
  ...NONE,
  t_confidence: "stated",
  confidence: "high",
  sources: [],
  ...fields,
});

const CLAIM_CALLS: ToolUseBlock[] = [
  use("toolu_stairwell_01", "add_event", event({ actor: "suspect", action: "walk", from: at("window_e"), to: at("window_s"), t_start: 0, t_end: 4 })),
  use("toolu_stairwell_02", "add_event", event({ actor: "suspect", action: "stand", at: at("window_s"), t_start: 4, t_end: 12 })),
  use("toolu_stairwell_03", "add_event", event({ actor: "witness", action: "stand", at: at("stairs_top"), t_start: 0, t_end: 12 })),
  use("toolu_stairwell_04", "add_event", event({ actor: "witness", action: "look", at: at("stairs_top"), target: "suspect", t_start: 6, t_end: 8 })),
  use("toolu_stairwell_05", "add_event", event({ actor: "suspect", action: "walk", from: at("window_s"), to: at("window_n"), t_start: 12, t_end: 16 })),
];

const CORRECTION_CALLS: ToolUseBlock[] = [
  use("toolu_stairwell_06", "update_event", { ...NONE, id: "w1e", t_start: 0, t_end: 4, sources: [] }),
  use("toolu_stairwell_07", "add_event", event({ actor: "witness", action: "walk", from: at("stairs_top"), to: at("window_w"), t_start: 4, t_end: 6 })),
  use("toolu_stairwell_08", "update_event", { ...NONE, id: "w2e", at: at("window_w"), sources: [] }),
];

const RECORDED: ReadonlyMap<string, readonly ToolUseBlock[]> = new Map([
  [normalizeStatement(STAIRWELL_CLAIM_TEXT), CLAIM_CALLS],
  [normalizeStatement(STAIRWELL_CORRECTION_TEXT), CORRECTION_CALLS],
]);

export const STAIRWELL_STATEMENTS: RecordedStatements = {
  calls: (text) => RECORDED.get(normalizeStatement(text)) ?? [],
  note: STAIRWELL_NOTE,
};
