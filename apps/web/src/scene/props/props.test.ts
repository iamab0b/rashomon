import { describe, expect, it } from "vitest";
import rawProps from "@rashomon/props";
import { robberyResolved } from "@rashomon/schema/fixtures";
import type { ResolvedGraph } from "@rashomon/engine";
import { parseLibrary, type PropType } from "./types";
import { matchAlias, modelScale, propsInScene } from "./library";
import { checkPropModels } from "./preload";

const clone = (): any[] => JSON.parse(JSON.stringify(rawProps));
const lib = parseLibrary(rawProps);

describe("parseLibrary", () => {
  it("parses the real props.json", () => {
    expect(lib.length).toBeGreaterThan(0);
  });
  it("rejects duplicate types", () => {
    const j = clone();
    j[1].type = j[0].type;
    expect(() => parseLibrary(j)).toThrow(/duplicate type/);
  });
  it("rejects non-positive dimensions", () => {
    const j = clone();
    j[0].dimensionsM.w = 0;
    expect(() => parseLibrary(j)).toThrow(/dimensionsM\.w/);
  });
  it("rejects unknown collider", () => {
    const j = clone();
    j[0].collider = "sphere";
    expect(() => parseLibrary(j)).toThrow(/collider/);
  });
  it("rejects graspable without gripOffset", () => {
    const j = clone();
    delete j[0].gripOffset;
    expect(() => parseLibrary(j)).toThrow(/gripOffset/);
  });
  it("rejects empty aliases", () => {
    const j = clone();
    j[0].aliases = [];
    expect(() => parseLibrary(j)).toThrow(/aliases/);
  });
  it("lists every violation in one message", () => {
    const j = clone();
    j[0].aliases = [];
    j[1].collider = "x";
    expect(() => parseLibrary(j)).toThrow(/2 violations[\s\S]*aliases[\s\S]*collider/);
  });
});

describe("matchAlias", () => {
  it.each([
    ["a kitchen knife", "knife_chef"],
    ["the gun", "handgun"],
    ["his bag", "backpack"],
  ])("%s -> %s", (text, type) => {
    expect(matchAlias(lib, text)?.type).toBe(type);
  });
  it("returns null for no match", () => {
    expect(matchAlias(lib, "sandwich")).toBeNull();
  });
  it("is case-insensitive", () => {
    expect(matchAlias(lib, "The GUN")?.type).toBe("handgun");
  });
});

describe("modelScale", () => {
  it("scales the longest model dimension to the entry's longest", () => {
    const entry: PropType = {
      type: "fixture",
      label: "fixture",
      aliases: ["fixture"],
      modelUrl: "/props/fixture.glb",
      dimensionsM: { l: 0.33, w: 0.05, h: 0.02 },
      massKg: 1,
      graspable: false,
      collider: "cuboid",
      gripOffset: [0, 0, 0],
      defaultNotes: "",
      source: "",
    };
    expect(modelScale(entry, [2, 0.3, 0.1])).toBeCloseTo(0.165, 10);
  });
});

describe("propsInScene", () => {
  const props = propsInScene(lib, (robberyResolved as unknown as ResolvedGraph).props);
  it("joins the knife", () => {
    const k = props.find((p) => p.id === "p_knife")!;
    expect(k.entry?.type).toBe("knife_chef");
    expect(k.heldByIntervals).toEqual([{ actor: "suspect", tStart: 11, tEnd: 24 }]);
  });
  it("joins the register", () => {
    expect(props.find((p) => p.id === "p_register")?.entry?.type).toBe("register");
  });
  it("gives null entry for unknown types", () => {
    const out = propsInScene(lib, [{ id: "x", type: "nope", position: [0, 0, 0], notes: "" }]);
    expect(out[0]!.entry).toBeNull();
  });
});

describe("checkPropModels", () => {
  it("reports everything missing", async () => {
    const r = await checkPropModels(lib, () => false);
    expect(r.existing).toEqual([]);
    expect(r.missing).toEqual([...new Set(lib.map((p) => p.modelUrl))]);
  });
  it("splits existing from missing", async () => {
    const first = lib[0]!.modelUrl;
    const r = await checkPropModels(lib, (u) => u === first);
    expect(r.existing).toEqual([first]);
    expect(r.missing).not.toContain(first);
    expect(r.existing.length + r.missing.length).toBe(new Set(lib.map((p) => p.modelUrl)).size);
  });
});
