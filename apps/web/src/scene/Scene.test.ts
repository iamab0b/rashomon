import { describe, expect, test } from "vitest";
import { Scene } from "./index";

describe("scene", () => {
  test("exports a Scene component", () => {
    expect(typeof Scene).toBe("function");
  });
});
