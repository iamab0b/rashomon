import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { gatedSnapshot } from "../scene/playback/graphSource";
import { CONFIRM_BODY, CONFIRM_TITLE, createSubmitGuard, OverrideConfirm } from "./OverrideConfirm";

const e5 = gatedSnapshot(robberyGraph, storeScene).resolved!.events.find((e) => e.id === "e5")!;
const render = (submitting = false) =>
  renderToStaticMarkup(
    <OverrideConfirm
      event={e5}
      reason="  Witness corrected the aisle on recall.  "
      submitting={submitting}
      onCancel={() => {}}
      onConfirm={() => {}}
      trapTab={() => {}}
    />,
  );

describe("override confirmation", () => {
  test("submit guard allows one claim until released", () => {
    const guard = createSubmitGuard();
    expect(guard.claim()).toBe(true);
    expect(guard.claim()).toBe(false);
    guard.release();
    expect(guard.claim()).toBe(true);
  });

  test("explains the consequence, shows what is being confirmed, offers Cancel and Confirm override", () => {
    const html = render();
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain(CONFIRM_TITLE);
    expect(html).toContain("Your reason will be recorded in the event history");
    expect(html).toContain("cannot currently be undone");
    expect(html).toContain("e5 · ");
    expect(html).toContain("10.0–12.0 s");
    expect(html).toContain("sightline");
    expect(html).toContain("“Witness corrected the aisle on recall.”");
    expect(html).toMatch(/data-action="cancel">Cancel</);
    expect(html).toContain("Confirm override");
    expect(html).not.toMatch(/Undo/);
  });

  test("copy does not accuse the witness or imply evidence is removed", () => {
    expect(`${CONFIRM_TITLE} ${CONFIRM_BODY}`).not.toMatch(/\b(lie|lying|liar|false|wrong|delete[ds]?|remove[ds]?|erase[ds]?)\b/i);
  });

  test("both actions are disabled while the override is being applied", () => {
    const html = render(true);
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain('aria-busy="true"');
  });
});
