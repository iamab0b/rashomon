import { describe, expect, test } from "vitest";
import { isGraphlessSearch } from "../scene";
import { LABELING_COPY, LOADING_COPY, loadingCopy } from "./loadingCopy";

describe("loadingCopy", () => {
  test("edit mode and saved-manifest views say there are no events", () => {
    expect(loadingCopy(isGraphlessSearch("?edit=landmarks"))).toBe(LABELING_COPY);
    expect(loadingCopy(isGraphlessSearch("?manifest=local:scan_demo"))).toBe(LABELING_COPY);
  });

  test("the default and scan views keep the loading copy", () => {
    expect(loadingCopy(isGraphlessSearch(""))).toBe(LOADING_COPY);
    expect(loadingCopy(isGraphlessSearch("?fixture=store&t=12"))).toBe(LOADING_COPY);
    expect(loadingCopy(isGraphlessSearch("?scene=/a.glb&manifest=local:x"))).toBe(LOADING_COPY);
  });
});
