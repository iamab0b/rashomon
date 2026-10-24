import { ACTIONS } from "@rashomon/schema";
import { describe, expect, test } from "vitest";
import { ACTION_MAP, chooseClip, IDLE_CLIP } from "./actionMap";
import { CLIP_NAMES } from "./clips";

const known = new Set<string>(CLIP_NAMES);
const hasKnownClip = (name: string): boolean => known.has(name);

describe("ACTION_MAP", () => {
  test("covers every schema action and nothing else", () => {
    expect(Object.keys(ACTION_MAP).sort()).toEqual([...ACTIONS].sort());
  });

  test("every action resolves to a clip that exists", () => {
    for (const action of ACTIONS) {
      expect(known.has(chooseClip(ACTION_MAP[action], hasKnownClip)), action).toBe(true);
    }
  });

  test("loop and one-shot flags follow the clip table", () => {
    const loops = ACTIONS.filter((action) => ACTION_MAP[action].loop).sort();
    expect(loops).toEqual(["crouch", "drop", "look", "run", "speak", "stand", "walk"]);
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
    expect(ACTION_MAP.throw.clip).toBe("clip_punch");
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
    });
  });

  test("only fall holds its last frame", () => {
    expect(ACTIONS.filter((action) => ACTION_MAP[action].holdLastFrame)).toEqual(["fall"]);
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
});
