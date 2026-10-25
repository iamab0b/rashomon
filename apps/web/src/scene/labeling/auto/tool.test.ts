import { describe, expect, test } from "vitest";
import {
  landmarkFromProposal,
  landmarkKindFor,
  PROPOSAL_KEYS,
  PROPOSAL_KINDS,
  PROPOSAL_LABELS,
  proposeLandmarksTool,
  validateProposals,
  type ProposalLabel,
} from "./tool";

type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; items?: Schema };

function objectsOf(schema: Schema): Schema[] {
  const own = schema.type === "object" ? [schema] : [];
  const children = [...Object.values(schema.properties ?? {}), ...(schema.items ? [schema.items] : [])];
  return [...own, ...children.flatMap(objectsOf)];
}

const ids = ["c1", "c2", "c3"];
const good = { candidate: "c1", label: "counter", kind: "occluder", occludes: true, confidence: 0.8, id: "front_counter" };

describe("propose_landmarks tool", () => {
  test("is strict, closes every object and requires every field", () => {
    const tool = proposeLandmarksTool(ids);
    expect(tool.name).toBe("propose_landmarks");
    expect(tool.strict).toBe(true);
    const objects = objectsOf(tool.input_schema as Schema);
    expect(objects).toHaveLength(2);
    for (const object of objects) {
      expect(object.additionalProperties).toBe(false);
      expect([...(object.required ?? [])].sort()).toEqual(Object.keys(object.properties ?? {}).sort());
    }
    const item = (tool.input_schema as Schema).properties!.proposals!.items!;
    expect(Object.keys(item.properties!)).toEqual([...PROPOSAL_KEYS]);
    expect(JSON.stringify(tool.input_schema)).not.toMatch(/anyOf|minimum|maximum|maxLength|pattern/);
    expect((item.properties!.candidate as { enum: string[] }).enum).toEqual(ids);
  });
});

describe("validateProposals", () => {
  test("keeps valid proposals and drops and counts each invalid one", () => {
    const result = validateProposals(
      {
        proposals: [
          good,
          { ...good, candidate: "c2", label: "fridge" },
          { ...good, candidate: "c2", confidence: 1.4 },
          { ...good, candidate: "c2", confidence: -0.1 },
          { ...good, candidate: "c9" },
          { ...good, label: "shelf" },
          { ...good, candidate: "c2", kind: "door" },
          { ...good, candidate: "c2", id: "Front Counter" },
          { ...good, candidate: "c2", id: "a_very_long_identifier_name" },
          { ...good, candidate: "c2", occludes: "yes" },
          { ...good, candidate: "c2", extra: 1 },
          "c2",
          { ...good, candidate: "c3", label: "other", kind: "zone", occludes: false, confidence: 0, id: "aisle" },
        ],
      },
      ids,
    );
    expect(result.proposals).toEqual([good, { candidate: "c3", label: "other", kind: "zone", occludes: false, confidence: 0, id: "aisle" }]);
    expect(result.dropped).toBe(11);
  });

  test("a missing or malformed proposals list yields nothing", () => {
    expect(validateProposals(null, ids)).toEqual({ proposals: [], dropped: 0 });
    expect(validateProposals({ proposals: "c1" }, ids)).toEqual({ proposals: [], dropped: 0 });
  });
});

describe("mapping to the schema", () => {
  const expected: Record<ProposalLabel, string> = {
    counter: "furniture",
    shelf: "furniture",
    door: "door",
    window: "window",
    cooler: "appliance",
    table: "furniture",
    wall: "furniture",
    other: "furniture",
  };

  test("covers every label and kind", () => {
    for (const label of PROPOSAL_LABELS) {
      for (const kind of PROPOSAL_KINDS) {
        expect(landmarkKindFor(label, kind)).toBe(kind === "zone" ? "zone" : expected[label]);
      }
    }
  });

  test("bounds and position come from the candidate and the label is title case", () => {
    const candidate = { bounds: { min: [1, 0, 2] as [number, number, number], max: [2, 1, 3] as [number, number, number] }, position: [1.5, 0, 2.5] as [number, number, number] };
    expect(landmarkFromProposal({ label: "cooler", kind: "occluder", occludes: true, id: "drinks" }, candidate)).toEqual({
      id: "drinks",
      label: "Cooler",
      aliases: ["cooler"],
      position: [1.5, 0, 2.5],
      bounds: { min: [1, 0, 2], max: [2, 1, 3] },
      kind: "appliance",
      occludes: true,
    });
  });
});
