import { ACTION_STYLES, ACTIONS, STYLE_ACTION, type Action } from "@rashomon/schema";
import { describe, expect, expectTypeOf, test } from "vitest";
import { ACTION_MAP, chooseClip, IDLE_CLIP, type ActionSpec } from "./actionMap";
import { CLIP_NAMES, OPTIONAL_CLIP_NAMES } from "./clips";

const known = new Set<string>(CLIP_NAMES);
const hasKnownClip = (name: string): boolean => known.has(name);

describe("ACTION_MAP", () => {
  test("covers every schema action and nothing else", () => {
    expect(Object.keys(ACTION_MAP).sort()).toEqual([...ACTIONS].sort());
  });

  test("every Action is a key of ACTION_MAP at the type level", () => {
    expectTypeOf<keyof typeof ACTION_MAP>().toEqualTypeOf<Action>();
    expectTypeOf(ACTION_MAP).toEqualTypeOf<Readonly<Record<Action, ActionSpec>>>();
  });

  test("every action resolves to a clip that exists", () => {
    for (const action of ACTIONS) {
      expect(known.has(chooseClip(ACTION_MAP[action], hasKnownClip)), action).toBe(true);
    }
  });

  test("loop and one-shot flags follow the clip table", () => {
    const loops = ACTIONS.filter((action) => ACTION_MAP[action].loop).sort();
    expect(loops).toEqual(["crouch", "drink", "drop", "hands_up", "look", "phone", "run", "speak", "stand", "walk"]);
  });

  test("clip names follow the clip table", () => {
    expect(ACTION_MAP.stand.clip).toBe("clip_idle");
    expect(ACTION_MAP.walk.clip).toBe("clip_walk");
    expect(ACTION_MAP.run.clip).toBe("clip_run");
    expect(ACTION_MAP.crouch.clip).toBe("clip_crouch_idle");
    expect(ACTION_MAP.fall.clip).toBe("clip_fall_back");
    expect(ACTION_MAP.shove.clip).toBe("clip_push");
    expect(ACTION_MAP.punch.clip).toBe("clip_punch");
    expect(ACTION_MAP.pick_up.clip).toBe("clip_pick_up");
    expect(ACTION_MAP.drop.clip).toBe("clip_idle");
    expect(ACTION_MAP.throw.clip).toBe("clip_throw");
    expect(ACTION_MAP.throw.fallbackClip).toBe("clip_punch");
    expect(ACTION_MAP.hands_up.clip).toBe("clip_hands_up");
    expect(ACTION_MAP.point.clip).toBe("clip_pointing");
    expect(ACTION_MAP.reach.clip).toBe("clip_reach");
    expect(ACTION_MAP.kneel.clip).toBe("clip_kneel");
    expect(ACTION_MAP.stumble.clip).toBe("clip_stumble_back");
    expect(ACTION_MAP.jump.clip).toBe("clip_jump_over");
    expect(ACTION_MAP.phone.clip).toBe("clip_phone");
    expect(ACTION_MAP.drink.clip).toBe("clip_drink");
    expect(ACTION_MAP.dodge.clip).toBe("clip_dodge");
    expect(ACTION_MAP.look.clip).toBe("clip_look_around");
    expect(ACTION_MAP.speak.clip).toBe("clip_talk");
  });

  test("blend in and out times follow the clip table", () => {
    const blends = Object.fromEntries(
      ACTIONS.map((action) => [action, [ACTION_MAP[action].blendInS, ACTION_MAP[action].blendOutS]]),
    );
    expect(blends).toEqual({
      stand: [0.2, 0.2],
      walk: [0.25, 0.25],
      run: [0.15, 0.15],
      crouch: [0.3, 0.3],
      fall: [0.1, 0],
      shove: [0.1, 0.2],
      punch: [0.1, 0.2],
      pick_up: [0.2, 0.2],
      drop: [0.2, 0.2],
      throw: [0.1, 0.2],
      open_door: [0.2, 0.2],
      look: [0.3, 0.3],
      speak: [0.3, 0.3],
      hands_up: [0.2, 0.2],
      point: [0.2, 0.2],
      reach: [0.2, 0.2],
      kneel: [0.2, 0],
      stumble: [0.1, 0.2],
      jump: [0.1, 0.2],
      phone: [0.3, 0.3],
      drink: [0.3, 0.3],
      dodge: [0.1, 0.2],
    });
  });

  test("only fall and kneel hold their last frame", () => {
    expect(ACTIONS.filter((action) => ACTION_MAP[action].holdLastFrame)).toEqual(["fall", "kneel"]);
  });

  test("each style sits on its own action's spec and names an optional clip", () => {
    const styled = ACTIONS.flatMap((action) =>
      Object.entries(ACTION_MAP[action].styles ?? {}).map(([style, clip]) => [style, action, clip]),
    );
    expect(styled.sort()).toEqual(
      [
        ["behind", "look", "clip_look_behind"],
        ["forward", "fall", "clip_fall_forward"],
        ["outward", "open_door", "clip_open_door_out"],
        ["scared", "run", "clip_run_scared"],
        ["sneak", "walk", "clip_sneak"],
      ],
    );
    for (const style of ACTION_STYLES) expect(ACTION_MAP[STYLE_ACTION[style]].styles?.[style]).toBeDefined();
  });

  test("the fifteen new clip files are all named by the map", () => {
    const named = new Set(
      ACTIONS.flatMap((action) => [ACTION_MAP[action].clip, ...Object.values(ACTION_MAP[action].styles ?? {})]),
    );
    for (const clip of OPTIONAL_CLIP_NAMES) expect(named.has(clip), clip).toBe(true);
    expect(OPTIONAL_CLIP_NAMES.filter((clip) => clip !== "clip_open_door")).toHaveLength(15);
  });

  test("shove and punch make the target play clip_shoved 0.3 s later", () => {
    for (const action of ["shove", "punch"] as const) {
      expect(ACTION_MAP[action].targetReaction).toEqual({ clip: "clip_shoved", delayS: 0.3 });
    }
    expect(ACTIONS.filter((action) => ACTION_MAP[action].targetReaction).sort()).toEqual(["punch", "shove"]);
  });

  test("prop attach and detach points follow the clip table", () => {
    expect(ACTION_MAP.pick_up.propAttachAt).toBe(0.6);
    expect(ACTION_MAP.throw.propDetachAt).toBe(0.4);
  });
});

describe("chooseClip", () => {
  test("open_door falls back to clip_idle when clip_open_door is missing", () => {
    expect(chooseClip(ACTION_MAP.open_door, hasKnownClip)).toBe(IDLE_CLIP);
  });

  test("open_door uses clip_open_door once it exists", () => {
    expect(chooseClip(ACTION_MAP.open_door, () => true)).toBe("clip_open_door");
  });

  test("a missing clip with no fallback falls back to idle", () => {
    expect(chooseClip(ACTION_MAP.walk, () => false)).toBe(IDLE_CLIP);
  });

  test("a style's clip is preferred when its file exists", () => {
    const all = () => true;
    expect(chooseClip(ACTION_MAP.walk, all, "sneak")).toBe("clip_sneak");
    expect(chooseClip(ACTION_MAP.run, all, "scared")).toBe("clip_run_scared");
    expect(chooseClip(ACTION_MAP.fall, all, "forward")).toBe("clip_fall_forward");
    expect(chooseClip(ACTION_MAP.open_door, all, "outward")).toBe("clip_open_door_out");
    expect(chooseClip(ACTION_MAP.look, all, "behind")).toBe("clip_look_behind");
  });

  test("a style whose file is missing falls back to the action's clip", () => {
    expect(chooseClip(ACTION_MAP.walk, hasKnownClip, "sneak")).toBe("clip_walk");
    expect(chooseClip(ACTION_MAP.look, hasKnownClip, "behind")).toBe("clip_look_around");
    expect(chooseClip(ACTION_MAP.open_door, hasKnownClip, "outward")).toBe(IDLE_CLIP);
  });

  test("a style on another action's spec is ignored", () => {
    expect(chooseClip(ACTION_MAP.walk, () => true, "scared")).toBe("clip_walk");
  });

  test("each new action falls back to an existing clip when its file is missing", () => {
    const fallbacks = Object.fromEntries(
      (["hands_up", "point", "reach", "kneel", "stumble", "jump", "phone", "drink", "dodge", "throw"] as const).map(
        (action) => [action, chooseClip(ACTION_MAP[action], hasKnownClip)],
      ),
    );
    expect(fallbacks).toEqual({
      hands_up: "clip_idle",
      point: "clip_idle",
      reach: "clip_pick_up",
      kneel: "clip_crouch_idle",
      stumble: "clip_shoved",
      jump: "clip_idle",
      phone: "clip_talk",
      drink: "clip_idle",
      dodge: "clip_crouch_idle",
      throw: "clip_punch",
    });
  });

  test("each new action uses its own clip once the file exists", () => {
    for (const action of ["hands_up", "point", "reach", "kneel", "stumble", "jump", "phone", "drink", "dodge", "throw"] as const)
      expect(chooseClip(ACTION_MAP[action], () => true)).toBe(ACTION_MAP[action].clip);
  });

  test("an approximated verb prefers its registered generated clip over style and action clips", () => {
    const has = (name: string) => name === "gen_staggered" || name === "clip_fall_forward" || name === "clip_fall_back";

    expect(chooseClip(ACTION_MAP.fall, has, "forward", " Staggered ")).toBe("gen_staggered");
  });

  test("an approximated verb without a generated clip keeps the nearest clip", () => {
    expect(chooseClip(ACTION_MAP.fall, hasKnownClip, undefined, "staggered")).toBe("clip_fall_back");
    expect(chooseClip(ACTION_MAP.fall, () => true, undefined, "ran!")).toBe("clip_fall_back");
  });
});
