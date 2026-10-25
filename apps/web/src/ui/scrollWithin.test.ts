import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { nearestScrollTop } from "./scrollWithin";

const here = import.meta.dirname;

describe("drawer scrolling never moves the rail", () => {
  test("nearestScrollTop moves only as far as needed, and only vertically", () => {
    const view = { top: 100, height: 200, scrollTop: 50 };
    expect(nearestScrollTop(view, { top: 150, height: 20 })).toBe(50);
    expect(nearestScrollTop(view, { top: 80, height: 20 })).toBe(30);
    expect(nearestScrollTop(view, { top: 320, height: 20 })).toBe(90);
    expect(nearestScrollTop(view, { top: 90, height: 400 })).toBe(40);
  });

  test("the drawer column clips instead of scrolling, so nothing can scroll it sideways", () => {
    const css = readFileSync(join(here, "context-drawer.css"), "utf8");
    const column = /\.rui\.context-column \{([^}]*)\}/.exec(css)![1]!;
    expect(column).toMatch(/overflow: clip;/);
  });

  test("ui code uses scrollWithin, never scrollIntoView, which also scrolls ancestors sideways", () => {
    const offenders = readdirSync(here)
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
      .filter((f) => readFileSync(join(here, f), "utf8").includes("scrollIntoView("));
    expect(offenders).toEqual([]);
  });
});
