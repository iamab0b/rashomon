import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { describe, expect, test } from "vitest";
import type { SceneManifest } from "@rashomon/schema";
import { resolve } from "../resolve/resolve";
import { contradictionFlags } from "./contradiction";
import { gate } from "./index";
import { spokenActor } from "./labels";
import mainGate from "./robbery.main-gate.json";
import { ev, graphOf } from "./testHelpers";

const manifest = (): SceneManifest => ({
  ...storeScene,
  landmarks: storeScene.landmarks,
});

const twoWitnesses = () => ({
  ...graphOf(
    [
      ev({ id: "p", witnessId: "w1", actor: "s", at: [8.1, 0, 2.5], tStart: 0, tEnd: 10, sources: ["utt_1"] }),
      ev({ id: "q", witnessId: "w2", actor: "s", at: [4.5, 0, 6], tStart: 5, tEnd: 12, sources: ["utt_w2_1"] }),
    ],
    ["s", "c", "w"],
  ),
  actors: [
    { id: "s", label: "Suspect", role: "suspect", rig: "mixamo_ybot" },
    { id: "c", label: "Clerk", role: "victim", rig: "mixamo_xbot" },
    { id: "w", label: "Witness (customer)", role: "witness", rig: "mixamo_ybot" },
  ],
  witnesses: [
    { id: "w1", label: "Customer", actorId: "w" },
    { id: "w2", label: "Clerk", actorId: "c" },
  ],
});

describe("cross-witness contradictions", () => {
  test("fire on both events, each question addressed to its own witness", () => {
    const flags = contradictionFlags(twoWitnesses(), manifest());
    expect(flags.map((f) => [f.eventId, f.severity, f.conflictsWith])).toEqual([
      ["p", "soft", ["q"]],
      ["q", "soft", ["p"]],
    ]);
    const [forP, forQ] = flags;
    expect(forP!.suggestedQuestion).toMatch(/^Another witness places the suspect by the .+ around then; you placed the suspect by the .+\. Where was the suspect, as you saw it\?$/);
    expect(forQ!.suggestedQuestion).toMatch(/^Another witness places the suspect by the .+ around then; you placed the suspect by the .+\. Where was the suspect, as you saw it\?$/);
    expect(forP!.suggestedQuestion).not.toBe(forQ!.suggestedQuestion);
    expect(forP!.evidence).toEqual(forQ!.evidence);
  });

  test("the places in each question are the speaker's own and the other witness's", () => {
    const [forP, forQ] = contradictionFlags(twoWitnesses(), manifest());
    const place = (q: string, which: "other" | "own") => {
      const m = /places the suspect by the (.+) around then; you placed the suspect by the (.+)\./.exec(q)!;
      return which === "other" ? m[1] : m[2];
    };
    expect(place(forP!.suggestedQuestion, "own")).toBe(place(forQ!.suggestedQuestion, "other"));
    expect(place(forQ!.suggestedQuestion, "own")).toBe(place(forP!.suggestedQuestion, "other"));
  });

  test("when the contradicted actor is the speaker, the question says you", () => {
    const g = twoWitnesses();
    const events = [
      ev({ id: "p", witnessId: "w1", actor: "c", at: [8.1, 0, 2.5], tStart: 0, tEnd: 10, sources: ["u1"] }),
      ev({ id: "q", witnessId: "w2", actor: "c", at: [4.5, 0, 6], tStart: 5, tEnd: 12, sources: ["u2"] }),
    ];
    const [forP, forQ] = contradictionFlags({ ...g, events }, manifest());
    expect(forP!.suggestedQuestion).toMatch(/^Another witness places the clerk by the .+ around then; you placed the clerk by the .+\. Where was the clerk, as you saw it\?$/);
    expect(forQ!.suggestedQuestion).toMatch(/^Another witness places you by the .+ around then; you said you were by the .+\. Where were you, as you saw it\?$/);
  });

  test("same-witness contradictions keep the old wording", () => {
    const g = twoWitnesses();
    const events = g.events.map((e) => ({ ...e, witnessId: "w1" }));
    const [forP] = contradictionFlags({ ...g, events }, manifest());
    expect(forP!.suggestedQuestion).toMatch(/^Earlier you said the suspect was by the .+ around then; now the .+\. Which came first\?$/);
  });
});

describe("the single-witness robbery", () => {
  test("gives byte-identical statuses, flags and questions to main", () => {
    const out = gate(resolve(robberyGraph, storeScene), storeScene, { meshes: [] });
    expect(JSON.stringify(out, null, 2)).toBe(JSON.stringify(mainGate, null, 2));
  });
});

describe("spokenActor with a witnesses list", () => {
  const g = twoWitnesses();

  test("says you only to the linked actor", () => {
    expect(spokenActor(g, "w", "w1")).toBe("you");
    expect(spokenActor(g, "c", "w2")).toBe("you");
    expect(spokenActor(g, "c", "w1")).toBe("the clerk");
    expect(spokenActor(g, "w", "w2")).toBe("the witness");
    expect(spokenActor(g, "s", "w1")).toBe("the suspect");
  });

  test("without a list it keeps the role rule, and without a witness id it does too", () => {
    const { witnesses: _w, ...noList } = g;
    expect(spokenActor(noList, "w", "w2")).toBe("you");
    expect(spokenActor(noList, "c", "w1")).toBe("the clerk");
    expect(spokenActor(g, "w")).toBe("you");
  });
});
