import type { EventGraph, Patch } from "@rashomon/schema";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { applyPatches } from "../scene";
import {
  addedLabel,
  baselineOf,
  isEditorRefusal,
  outcomeSince,
  voiceInterviewEnabled,
  type SubmitStatement,
} from "./statement";
import { FIXTURE_NOTE, StatementSectionView, type StatementSectionViewProps, type StatementView } from "./StatementSection";
import { gated, gatedRobbery } from "./testGraph";

const CORRECTION = "Oh. No, you're right, I'd stepped out. I came to the front by the window to see what was going on. I saw him from there.";
const correctionPatches = (robberyGraph as EventGraph & { correctionPatch: { patches: Patch[] } }).correctionPatch.patches;

const stubSubmit = (patches: readonly Patch[]): SubmitStatement =>
  vi.fn(async () => {
    stubState.after = gated(applyPatches(robberyGraph, patches, 1, storeScene));
    return { segmentId: "seg_test", baseVersion: 1 };
  });
const stubState: { after: ReturnType<typeof gatedRobbery> | null } = { after: null };

function props(view: StatementView, overrides: Partial<StatementSectionViewProps> = {}): StatementSectionViewProps {
  return {
    graph: gatedRobbery(),
    witness: "Witness",
    text: "",
    view,
    voiceEnabled: false,
    onWitness: () => {},
    onText: () => {},
    onSubmit: () => {},
    onSelect: () => {},
    onCopyIdentity: () => {},
    ...overrides,
  };
}

function find(node: ReactNode, matches: (el: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, matches);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement<Record<string, unknown>>(node)) return null;
  if (matches(node)) return node;
  return find(node.props.children as ReactNode, matches);
}

describe("statement section", () => {
  test("the robbery correction shows extracting, then Added with e5 among the changed events", async () => {
    const before = gatedRobbery();
    const baseline = baselineOf(before);
    const extracting = renderToStaticMarkup(<StatementSectionView {...props({ kind: "extracting", sent: CORRECTION, slow: false }, { text: CORRECTION })} />);
    expect(extracting).toContain("Extracting…");
    expect(extracting).toMatch(/aria-live="polite"/);
    expect(extracting).toContain('class="is-sent"');
    expect(extracting).toMatch(/<button[^>]*disabled=""[^>]*>Submit/);

    const result = await stubSubmit(correctionPatches)(CORRECTION, "Witness");
    expect(result.segmentId).toBe("seg_test");
    const outcome = outcomeSince(baseline, stubState.after);
    expect(outcome.changed.map((e) => e.id)).toContain("e5");
    expect(outcome.added.length).toBeGreaterThan(0);
    const label = addedLabel(correctionPatches.length, outcome);
    expect(label).toMatch(/^Added \d+ events$/);

    const onSelect = vi.fn();
    const view: StatementView = { kind: "done", label, outcome, fixtureNote: false };
    const html = renderToStaticMarkup(<StatementSectionView {...props(view, { graph: stubState.after })} />);
    expect(html).toContain(label);
    expect(html).toMatch(/changed<\/span><span class="statement-event__what">e5 · /);
    const tree = StatementSectionView(props(view, { graph: stubState.after, onSelect }));
    const row = find(tree, (el) => (el.props.event as { id?: string } | undefined)?.id === "e5")!;
    const rendered = (row.type as (p: Record<string, unknown>) => ReactElement)(row.props);
    const button = find(rendered, (el) => el.props.className === "statement-event")!;
    (button.props.onClick as () => void)();
    expect(onSelect).toHaveBeenCalledWith("e5");
  });

  test("after 30 s the extracting line says the model is slow", () => {
    expect(renderToStaticMarkup(<StatementSectionView {...props({ kind: "extracting", sent: "x", slow: true })} />)).toContain(
      "Still extracting — the model is slow",
    );
  });

  test("an unrelated sentence shows No events found, with the fixture note", () => {
    const baseline = baselineOf(gatedRobbery());
    const outcome = outcomeSince(baseline, gatedRobbery());
    expect(outcome).toEqual({ added: [], changed: [], flags: [] });
    const label = addedLabel(0, outcome);
    expect(label).toBe("No events found in that statement");
    const html = renderToStaticMarkup(<StatementSectionView {...props({ kind: "done", label, outcome, fixtureNote: true })} />);
    expect(html).toContain("No events found in that statement");
    expect(html).toContain(FIXTURE_NOTE.replace("'", "&#x27;"));
  });

  test("a rejection shows the message and keeps the text to resend", () => {
    const text = "He ran out the back.";
    const html = renderToStaticMarkup(<StatementSectionView {...props({ kind: "failed", error: "stale baseVersion 1" }, { text })} />);
    expect(html).toMatch(/role="alert">stale baseVersion 1</);
    expect(html).toContain(`>${text}</textarea>`);
    expect(html).toMatch(/<button[^>]*class="button button--primary"(?![^>]*disabled)[^>]*>Submit/);
  });

  test("the not-an-editor refusal shows the browser identity with Copy", () => {
    expect(isEditorRefusal("submit_statement: caller is not an editor")).toBe(true);
    expect(isEditorRefusal("stale baseVersion 1")).toBe(false);
    const onCopy = vi.fn();
    const view: StatementView = { kind: "refused", identity: "c200abcd1234" };
    const html = renderToStaticMarkup(<StatementSectionView {...props(view)} />);
    expect(html).toContain("This browser can&#x27;t add statements.");
    expect(html).toContain("<code>c200abcd1234</code>");
    const copy = find(StatementSectionView(props(view, { onCopyIdentity: onCopy })), (el) => el.props.children === "Copy");
    (copy!.props.onClick as () => void)();
    expect(onCopy).toHaveBeenCalledWith("c200abcd1234");
  });

  test("keys typed in the textarea stay there; Ctrl or Cmd+Enter submits", () => {
    const onSubmit = vi.fn();
    const tree = StatementSectionView(props({ kind: "idle" }, { text: "I saw him.", onSubmit }));
    const textarea = find(tree, (el) => el.type === "textarea")!;
    const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean }> = {}) => {
      const event = { key: k, ctrlKey: false, metaKey: false, ...mods, stopPropagation: vi.fn(), preventDefault: vi.fn() };
      (textarea.props.onKeyDown as (e: typeof event) => void)(event);
      return event;
    };
    for (const k of ["2", "5", " ", "ArrowLeft", "Enter"]) expect(key(k).stopPropagation).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    key("Enter", { ctrlKey: true });
    key("Enter", { metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
    const witness = find(tree, (el) => el.type === "input")!;
    const event = { key: "1", stopPropagation: vi.fn() };
    (witness.props.onKeyDown as (e: typeof event) => void)(event);
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  test("the voice button is hidden by default and shows only behind the flag", () => {
    expect(voiceInterviewEnabled("")).toBe(false);
    expect(voiceInterviewEnabled("?voice=1")).toBe(true);
    expect(voiceInterviewEnabled("", true)).toBe(true);
    expect(renderToStaticMarkup(<StatementSectionView {...props({ kind: "idle" })} />)).not.toContain("Start voice interview");
    const on = renderToStaticMarkup(<StatementSectionView {...props({ kind: "idle" }, { voiceEnabled: true })} />);
    expect(on).toContain("Start voice interview");
    expect(on).toContain("Voice interview coming soon");
  });

  test("Submit is disabled while the text is empty or before submitStatement exists", () => {
    expect(renderToStaticMarkup(<StatementSectionView {...props({ kind: "idle" })} />)).toMatch(/disabled=""[^>]*>Submit/);
    const unavailable = renderToStaticMarkup(<StatementSectionView {...props({ kind: "unavailable" }, { text: "x" })} />);
    expect(unavailable).toMatch(/disabled=""[^>]*>Submit/);
    expect(unavailable).toContain("not on main yet");
  });
});
