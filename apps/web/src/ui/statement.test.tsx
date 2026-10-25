import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { selectSource, type FixtureGraphSource } from "../scene";
import {
  addedLabel,
  baselineOf,
  isEditorRefusal,
  isStatementRejection,
  noteStatementRejection,
  outcomeSince,
  alreadyAddedResult,
  isResend,
  rememberResult,
  sourceKey,
  resultOf,
  statementView,
  voiceInterviewEnabled,
  type StatementRun,
} from "./statement";
import { StatementSectionView, type StatementSectionViewProps, type StatementView } from "./StatementSection";
import { gatedRobbery } from "./testGraph";

const SRC = "fixture:store_v1";
const CORRECTION = "Oh. No, you're right, I'd stepped out. I came to the front by the window to see what was going on. I saw him from there.";

async function submitOnFixture(text: string) {
  const source = selectSource("") as FixtureGraphSource;
  const baseline = baselineOf(source.getSnapshot().resolved);
  const { segmentId } = await source.submitStatement(text, "Witness");
  const first = source.statementStatuses()[segmentId];
  await vi.waitFor(() => expect(source.statementStatuses()[segmentId]?.state).not.toBe("extracting"));
  return { source, first, status: source.statementStatuses()[segmentId]!, baseline, after: source.getSnapshot().resolved };
}

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
    const extracting = renderToStaticMarkup(<StatementSectionView {...props({ kind: "extracting", sent: CORRECTION, slow: false }, { text: CORRECTION })} />);
    expect(extracting).toContain("Extracting…");
    expect(extracting).toMatch(/aria-live="polite"/);
    expect(extracting).toContain('class="is-sent"');
    expect(extracting).toMatch(/<button[^>]*disabled=""[^>]*>Submit/);

    const { first, status, baseline, after } = await submitOnFixture(CORRECTION);
    expect(first?.state).toBe("extracting");
    expect(status.state).toBe("done");
    expect(status.patchCount).toBe(4);
    const outcome = outcomeSince(baseline, after);
    expect(outcome.changed.map((e) => e.id)).toContain("e5");
    expect(after!.events.every((e) => e.status === "plausible")).toBe(true);
    const label = addedLabel(status.patchCount, outcome);
    expect(label).toMatch(/^Added \d+ events?$/);

    const onSelect = vi.fn();
    const view: StatementView = { kind: "done", label, outcome };
    const html = renderToStaticMarkup(<StatementSectionView {...props(view, { graph: after })} />);
    expect(html).toContain(label);
    expect(html).toMatch(/changed<\/span><span class="statement-event__what">e5 · /);
    const tree = StatementSectionView(props(view, { graph: after, onSelect }));
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

  test("an unrelated sentence shows No events found, with the fixture's note", async () => {
    const { status, baseline, after } = await submitOnFixture("The weather was nice that morning.");
    expect(status.state).toBe("done");
    expect(status.patchCount ?? 0).toBe(0);
    const outcome = outcomeSince(baseline, after);
    expect(outcome).toEqual({ added: [], changed: [], props: [], flags: [] });
    const label = addedLabel(status.patchCount, outcome);
    expect(label).toBe("No events found in that statement");
    const view: StatementView = { kind: "done", label, outcome, ...(status.note ? { note: status.note } : {}) };
    const html = renderToStaticMarkup(<StatementSectionView {...props(view)} />);
    expect(html).toContain("No events found in that statement");
    if (status.note) expect(html).toContain('class="statement-note"');
  });

  test("a rejection shows the message and keeps the text to resend", () => {
    const text = "He ran out the back.";
    const html = renderToStaticMarkup(<StatementSectionView {...props({ kind: "failed", error: "stale baseVersion 1" }, { text })} />);
    expect(html).toMatch(/role="alert">stale baseVersion 1</);
    expect(html).toContain(`>${text}</textarea>`);
    expect(html).toMatch(/<button[^>]*class="button button--primary"(?![^>]*disabled)[^>]*>Submit/);
  });

  test("the not-an-editor refusal shows the browser identity with Copy", () => {
    expect(isEditorRefusal("only editors can add statements")).toBe(true);
    expect(isEditorRefusal("statement rejected: only editors can add statements")).toBe(true);
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

  test("keys typed in the fields stay there; Ctrl or Cmd+Enter submits", () => {
    const onSubmit = vi.fn();
    const tree = StatementSectionView(props({ kind: "idle" }, { text: "I saw him.", onSubmit }));
    const textarea = find(tree, (el) => el.type === "textarea")!;
    const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean }> = {}) => {
      const event = { key: k, ctrlKey: false, metaKey: false, ...mods, stopPropagation: vi.fn(), preventDefault: vi.fn() };
      (textarea.props.onKeyDown as (e: typeof event) => void)(event);
      return event;
    };
    for (const k of ["2", "5", " ", "ArrowLeft", "Enter"]) expect(key(k).stopPropagation).toHaveBeenCalled();
    expect(key("Escape").stopPropagation).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    key("Enter", { ctrlKey: true });
    key("Enter", { metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
    const witness = find(tree, (el) => el.type === "input")!;
    const event = { key: "1", stopPropagation: vi.fn() };
    (witness.props.onKeyDown as (e: typeof event) => void)(event);
    expect(event.stopPropagation).toHaveBeenCalled();
    const escape = { key: "Escape", stopPropagation: vi.fn() };
    (witness.props.onKeyDown as (e: typeof escape) => void)(escape);
    expect(escape.stopPropagation).not.toHaveBeenCalled();
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

  test("the live voice control says Talk to the interviewer above the text box, with a status pill", () => {
    const voice = { status: "idle", error: null, active: false, toggle: () => {} };
    const idle = renderToStaticMarkup(<StatementSectionView {...props({ kind: "idle" }, { voiceEnabled: true, voice })} />);
    expect(idle).toContain("Talk to the interviewer");
    expect(idle).toMatch(/button--primary voice-control__button/);
    expect(idle.indexOf("Talk to the interviewer")).toBeLessThan(idle.indexOf("<textarea"));
    expect(idle).not.toContain("voice-control__pill");
    expect(idle).not.toContain("coming soon");
    const live = renderToStaticMarkup(<StatementSectionView {...props({ kind: "idle" }, { voiceEnabled: true, voice: { ...voice, status: "listening", active: true } })} />);
    expect(live).toMatch(/voice-control__pill">listening</);
    expect(live).toContain("Stop talking");
    const failed = renderToStaticMarkup(<StatementSectionView {...props({ kind: "idle" }, { voiceEnabled: true, voice: { ...voice, status: "error", error: "Token server returned 502" } })} />);
    expect(failed).toMatch(/voice-control__pill is-error">error</);
    expect(failed).toContain("Token server returned 502");
  });

  test("Submit is disabled while the text is empty", () => {
    expect(renderToStaticMarkup(<StatementSectionView {...props({ kind: "idle" })} />)).toMatch(/disabled=""[^>]*>Submit/);
    expect(renderToStaticMarkup(<StatementSectionView {...props({ kind: "idle" }, { text: "x" })} />)).not.toMatch(/disabled=""[^>]*>Submit/);
  });

  test("the controller shows extracting, then a result that a later change does not alter", async () => {
    const source = selectSource("") as FixtureGraphSource;
    const before = source.getSnapshot().resolved;
    let run: StatementRun = { sent: CORRECTION, baseline: baselineOf(before), segmentId: null, error: null, result: null, resent: null, source: SRC };
    expect(statementView(run, null, before, null, false).kind).toBe("extracting");

    const { segmentId, baseVersion } = await source.submitStatement(CORRECTION, "Witness");
    run = { ...run, segmentId, baseline: { ...run.baseline, version: baseVersion } };
    expect(source.statementStatuses()[segmentId]?.state).toBe("extracting");
    run = { ...run, resent: false, source: SRC };
    expect(statementView(run, source.statementStatuses()[segmentId] ?? null, source.getSnapshot().resolved, null, false).kind).toBe("extracting");
    await vi.waitFor(() => expect(source.statementStatuses()[segmentId]?.state).toBe("done"));

    const status = source.statementStatuses()[segmentId]!;
    const result = resultOf(run.baseline, status, source.getSnapshot().resolved)!;
    expect(result.label).toBe("Added 4 events");
    run = { ...run, result };

    source.apply([{ op: "update_event", id: "e2", changes: { t: [0, 12] }, sources: ["utt_2"] }]);
    const later = source.getSnapshot().resolved;
    expect(outcomeSince(run.baseline, later).changed.map((e) => e.id)).toContain("e2");
    const view = statementView(run, status, later, null, false);
    expect(view.kind === "done" && view.outcome.changed.map((e) => e.id)).not.toContain("e2");
    expect(view.kind === "done" && view.label).toBe("Added 4 events");
  });

  test("in live mode only a version past the baseline freezes the result; the fixture also accepts a visible change", () => {
    const graph = gatedRobbery();
    const baseline = baselineOf(graph);
    const run: StatementRun = { sent: "x", baseline, segmentId: "seg", error: null, result: null, resent: false, source: SRC };
    const done = { state: "done", patchCount: 2 } as const;
    expect(statementView(run, done, graph, null, false, true).kind).toBe("extracting");
    expect(statementView(run, { state: "done", patchCount: 0 }, graph, null, false, true)).toMatchObject({ kind: "done", label: "No events found in that statement" });
    expect(statementView(run, done, { ...graph, version: graph.version + 1 }, null, false, true).kind).toBe("done");

    const [first, ...rest] = graph.events;
    const otherEditor = { ...graph, events: [{ ...first!, facing: [0, 0, 1] as [number, number, number] }, ...rest] };
    expect(statementView(run, done, otherEditor, null, false, true).kind).toBe("extracting");
    expect(statementView(run, done, otherEditor, null, false, false).kind).toBe("done");
  });

  test("facing, sources and override count as changes; prop-only patches say Updated N details", () => {
    const graph = gatedRobbery();
    const baseline = baselineOf(graph);
    const [first, ...rest] = graph.events;
    const moved = { ...graph, events: [{ ...first!, facing: [1, 0, 0] as [number, number, number] }, ...rest] };
    expect(outcomeSince(baseline, moved).changed.map((e) => e.id)).toEqual([first!.id]);
    const sourced = { ...graph, events: [{ ...first!, sources: [...first!.sources, "utt_99"] }, ...rest] };
    expect(outcomeSince(baseline, sourced).changed).toHaveLength(1);

    const prop = graph.props[0];
    const props = prop ? [{ ...prop, notes: `${prop.notes} (moved)` }, ...graph.props.slice(1)] : [];
    const outcome = outcomeSince(baseline, { ...graph, props });
    expect(outcome.added.length + outcome.changed.length).toBe(0);
    expect(addedLabel(1, outcome)).toBe("Updated 1 detail");
    expect(addedLabel(3, { added: [], changed: [], props: [], flags: [] })).toBe("Updated 3 details");
  });

  test("statement rejections are shown inline, so RightPanel skips its toast for them", () => {
    expect(isStatementRejection("stale baseVersion 7")).toBe(false);
    noteStatementRejection("stale baseVersion 7");
    expect(isStatementRejection("stale baseVersion 7")).toBe(true);
    expect(isStatementRejection("statement rejected: the live graph source is not connected")).toBe(true);
    expect(isStatementRejection("patches rejected: the live graph source is not connected")).toBe(false);
  });

  test("Copy says Copied, or asks to select and copy when there is no clipboard", () => {
    const view: StatementView = { kind: "refused", identity: "c200abcd1234" };
    expect(renderToStaticMarkup(<StatementSectionView {...props(view, { copyState: "copied" })} />)).toContain(">Copied</button>");
    expect(renderToStaticMarkup(<StatementSectionView {...props(view, { copyState: "manual" })} />)).toContain("Select and copy the identity above.");
  });

  test("resubmitting a finished statement shows the saved result at once, with Submit enabled", async () => {
    const source = selectSource("") as FixtureGraphSource;
    const before = source.getSnapshot().resolved;
    const first = await source.submitStatement(CORRECTION, "Witness");
    await vi.waitFor(() => expect(source.statementStatuses()[first.segmentId]?.state).toBe("done"));
    const baseline = baselineOf(before, first.baseVersion);
    const result = resultOf(baseline, source.statementStatuses()[first.segmentId]!, source.getSnapshot().resolved)!;
    rememberResult(SRC, first.segmentId, result);

    const again = await source.submitStatement(CORRECTION, "Witness");
    expect(again.segmentId).toBe(first.segmentId);
    const status = source.statementStatuses()[again.segmentId]!;
    expect(status.state).toBe("done");
    const run: StatementRun = {
      sent: CORRECTION,
      baseline: baselineOf(source.getSnapshot().resolved, again.baseVersion),
      segmentId: again.segmentId,
      error: null,
      result: null,
      resent: true,
      source: SRC,
    };
    const view = statementView(run, status, source.getSnapshot().resolved, null, false);
    expect(view).toMatchObject({ kind: "done", label: "Already added: 4 events" });
    const html = renderToStaticMarkup(<StatementSectionView {...props(view, { text: CORRECTION })} />);
    expect(html).toContain("Already added: 4 events");
    expect(html).toMatch(/<button[^>]*class="button button--primary"(?![^>]*disabled)[^>]*>Submit/);

    expect(alreadyAddedResult(SRC, "never-seen", { state: "done", patchCount: 3 }).label).toBe("Already added: 3 changes");
  });

  test("a fresh submit that is done on its first reading, with no status before submit, shows its own result", async () => {
    const source = selectSource("") as FixtureGraphSource;
    const statusesBefore = source.statementStatuses();
    const before = source.getSnapshot().resolved;
    const { segmentId, baseVersion } = await source.submitStatement(CORRECTION, "Witness");
    expect(statusesBefore[segmentId]).toBeUndefined();
    await vi.waitFor(() => expect(source.statementStatuses()[segmentId]?.state).toBe("done"));
    const fresh = sourceKey("fixture", "fresh-scene");
    expect(isResend(fresh, segmentId, statusesBefore[segmentId] ?? null)).toBe(false);
    const run: StatementRun = { sent: CORRECTION, baseline: baselineOf(before, baseVersion), segmentId, error: null, result: null, resent: false, source: fresh };
    const view = statementView(run, source.statementStatuses()[segmentId]!, source.getSnapshot().resolved, null, false);
    expect(view).toMatchObject({ kind: "done", label: "Added 4 events" });
  });

  test("a resubmit is a segment whose status before submit already had a patchCount, or one this tab saved for the same scene", () => {
    expect(isResend(SRC, "never-seen", null)).toBe(false);
    expect(isResend(SRC, "never-seen", { state: "extracting" })).toBe(false);
    expect(isResend(SRC, "never-seen", { state: "done" })).toBe(false);
    expect(isResend(SRC, "never-seen", { state: "done", patchCount: 2 })).toBe(true);
    expect(isResend(SRC, "never-seen", { state: "done", patchCount: 0 })).toBe(true);
    rememberResult(SRC, "saved-seg", { label: "Added 1 event", outcome: { added: [], changed: [], props: [], flags: [] } });
    expect(isResend(SRC, "saved-seg", null)).toBe(true);
  });

  test("a saved result doesn't survive a scene change in the same tab", () => {
    const store = sourceKey("fixture", "store_v1");
    const scan = sourceKey("fixture", "zatec_room");
    rememberResult(store, "same-seg", { label: "Added 2 events", outcome: { added: [], changed: [], props: [], flags: [] } });
    expect(isResend(store, "same-seg", null)).toBe(true);
    expect(isResend(scan, "same-seg", null)).toBe(false);
    expect(isResend(sourceKey("live", "store_v1"), "same-seg", null)).toBe(false);
    expect(alreadyAddedResult(scan, "same-seg", { state: "done", patchCount: 1 }).label).toBe("Already added: 1 change");
  });

  test("zero patches show an empty outcome, never another editor's change", () => {
    const graph = gatedRobbery();
    const baseline = baselineOf(graph);
    const [first, ...rest] = graph.events;
    const otherEditor = { ...graph, version: graph.version + 1, events: [{ ...first!, facing: [0, 0, 1] as [number, number, number] }, ...rest] };
    const run: StatementRun = { sent: "x", baseline, segmentId: "seg0", error: null, result: null, resent: false, source: SRC };
    for (const live of [true, false]) {
      const view = statementView(run, { state: "done", patchCount: 0 }, otherEditor, null, false, live);
      expect(view).toMatchObject({ kind: "done", label: "No events found in that statement", outcome: { added: [], changed: [], props: [], flags: [] } });
    }
  });
});
