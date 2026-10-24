import { storeScene } from "@rashomon/schema/fixtures";
import { describe, expect, test } from "vitest";
import { buildPlaceholder } from "../loaders/scene";
import { hidePlaceholderBoxes } from "./placeholders";

describe("hidePlaceholderBoxes", () => {
  test("hides only the named boxes and restores them", () => {
    const placeholder = buildPlaceholder(storeScene);
    const restore = hidePlaceholderBoxes(placeholder, ["cooler", "not_a_landmark"]);
    expect(placeholder.getObjectByName("cooler")?.visible).toBe(false);
    expect(placeholder.getObjectByName("shelf_a")?.visible).toBe(true);
    restore();
    expect(placeholder.getObjectByName("cooler")?.visible).toBe(true);
  });

  test("leaves every box alone when nothing is covered", () => {
    const placeholder = buildPlaceholder(storeScene);
    hidePlaceholderBoxes(placeholder, []);
    for (const id of ["shelf_a", "shelf_b", "counter", "cooler"]) {
      expect(placeholder.getObjectByName(id)?.visible).toBe(true);
    }
  });
});
