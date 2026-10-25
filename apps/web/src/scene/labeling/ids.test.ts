import { describe, expect, test } from "vitest";
import { idForLabel, parseAliases, slugify, uniqueId } from "./ids";

describe("ids", () => {
  test("slugify lowercases, strips apostrophes and joins words with underscores", () => {
    expect(slugify("Clerk's Counter #2")).toBe("clerks_counter_2");
    expect(slugify("  Front   Door ")).toBe("front_door");
  });

  test("slugify falls back when nothing usable remains", () => {
    expect(slugify("???")).toBe("landmark");
  });

  test("uniqueId suffixes until free", () => {
    expect(uniqueId("shelf", ["door"])).toBe("shelf");
    expect(uniqueId("shelf", ["shelf"])).toBe("shelf_2");
    expect(uniqueId("shelf", ["shelf", "shelf_2"])).toBe("shelf_3");
  });

  test("idForLabel slugifies then dedupes", () => {
    expect(idForLabel("Shelf", ["shelf"])).toBe("shelf_2");
  });

  test("aliases split on commas and drop blanks", () => {
    expect(parseAliases("the door, entrance ,, front ")).toEqual(["the door", "entrance", "front"]);
    expect(parseAliases("")).toEqual([]);
  });
});
