import type { ToolUseBlock } from "@rashomon/extractor";

export const RECORDED_NOTE = "fixture mode only understands the robbery's statements";

export const normalizeStatement = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const at = (landmark: string) => ({ kind: "at", landmark, second_landmark: null, radius_m: null });

export const NONE = { from: null, to: null, at: null, facing: null, target: null, prop: null, action: null, t_start: null, t_end: null };

export const use = (id: string, name: string, input: Record<string, unknown>): ToolUseBlock => ({
  type: "tool_use",
  id,
  name,
  input,
});

export const CORRECTION_TEXT =
  "Oh. No, you're right, I'd stepped out. I came to the front by the window to see what was going on. I saw him from there.";

const CORRECTION_CALLS: ToolUseBlock[] = [
  use("toolu_fixture_01", "update_event", { ...NONE, id: "e5", at: at("window_front"), sources: [] }),
  use("toolu_fixture_02", "update_event", { ...NONE, id: "e3", t_start: 0, t_end: 9, sources: [] }),
  use("toolu_fixture_03", "add_event", {
    actor: "witness",
    action: "walk",
    from: at("aisle_chips"),
    to: at("window_front"),
    at: null,
    facing: null,
    target: null,
    prop: null,
    t_start: 8,
    t_end: 11,
    t_confidence: "inferred",
    confidence: "high",
    sources: [],
  }),
  use("toolu_fixture_04", "update_event", { ...NONE, id: "e9", at: at("window_front"), sources: [] }),
];

const RECORDED: ReadonlyMap<string, readonly ToolUseBlock[]> = new Map([[normalizeStatement(CORRECTION_TEXT), CORRECTION_CALLS]]);

export type RecordedStatements = {
  readonly calls: (text: string) => readonly ToolUseBlock[];
  readonly note: string;
};

export function recordedToolCalls(text: string): readonly ToolUseBlock[] {
  return RECORDED.get(normalizeStatement(text)) ?? [];
}

export const ROBBERY_STATEMENTS: RecordedStatements = { calls: recordedToolCalls, note: RECORDED_NOTE };
