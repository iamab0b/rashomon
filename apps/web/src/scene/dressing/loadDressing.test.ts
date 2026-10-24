import { Group } from "three";
import { describe, expect, test, vi } from "vitest";
import { loadDressingModels } from "./loadDressing";

describe("loadDressingModels", () => {
  test("loads only the files that exist", async () => {
    const load = vi.fn(async () => new Group());
    const models = await loadDressingModels(["/a.glb", "/b.glb"], async (url) => url === "/a.glb", load);
    expect([...models.keys()]).toEqual(["/a.glb"]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("/a.glb");
  });

  test("skips a file that fails to load and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const models = await loadDressingModels(
      ["/good.glb", "/bad.glb"],
      async () => true,
      async (url) => {
        if (url === "/bad.glb") throw new Error("corrupt");
        return new Group();
      },
    );
    expect([...models.keys()]).toEqual(["/good.glb"]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  test("returns an empty map when the dressing folder is empty", async () => {
    const models = await loadDressingModels(["/a.glb"], async () => false, async () => new Group());
    expect(models.size).toBe(0);
  });
});
