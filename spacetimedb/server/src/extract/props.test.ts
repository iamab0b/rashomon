import { describe, expect, test } from "vitest";
import type { Patch, PropInstance } from "@rashomon/schema";
import { mintPropIds } from "./props";

const anchor = { kind: "at", landmark: "counter" } as const;
const addProp = (type: string): Patch => ({ op: "add_prop", prop: { type, anchor, notes: "", sources: ["s"] } });
const addEvent = (prop: string | undefined): Patch => ({
  op: "add_event",
  event: { witnessId: "w", actor: "a", action: "pick_up", at: anchor, ...(prop ? { prop } : {}), t: [0, 1], tConfidence: "stated", confidence: 0.9, sources: ["s"] },
});

describe("mintPropIds", () => {
  test("mints p_<type> and rewrites a later event that names the type", () => {
    const out = mintPropIds([addProp("knife_chef"), addEvent("knife_chef")], { props: [] });
    expect(out[0]).toMatchObject({ prop: { id: "p_knife_chef" } });
    expect(out[1]).toMatchObject({ event: { prop: "p_knife_chef" } });
  });

  test("numbers further props of the same type and points events at the latest", () => {
    const existing: PropInstance[] = [{ id: "p_knife_chef", type: "knife_chef", anchor, notes: "", sources: ["s"] }];
    const out = mintPropIds([addProp("knife_chef"), addEvent("knife_chef")], { props: existing });
    expect(out[0]).toMatchObject({ prop: { id: "p_knife_chef_2" } });
    expect(out[1]).toMatchObject({ event: { prop: "p_knife_chef_2" } });
  });

  test("a type with an existing prop and none added resolves to that prop, and ids pass through", () => {
    const existing: PropInstance[] = [{ id: "p_register", type: "register", anchor, notes: "", sources: ["s"] }];
    const out = mintPropIds([addEvent("register"), addEvent("p_register"), addEvent(undefined)], { props: existing });
    expect(out.map((p) => (p.op === "add_event" ? p.event.prop : "x"))).toEqual(["p_register", "p_register", undefined]);
  });

  test("a client-supplied prop id is kept", () => {
    const withId: Patch = { op: "add_prop", prop: { id: "p_mine", type: "knife_chef", anchor, notes: "", sources: ["s"] } };
    expect(mintPropIds([withId], { props: [] })[0]).toEqual(withId);
  });
});
