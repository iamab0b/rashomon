import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { roomScene, storeScene } from "@rashomon/schema/fixtures";
import type { Client } from "./cartesia";
import { agentBody } from "./config";
import { settingsFrom } from "./setup";

const STORE_BODY = readFileSync(new URL("./fixtures/store-agent-body.json", import.meta.url), "utf8");

const env = {
  RASHOMON_SESSION_ID: "demo1",
  RASHOMON_TUNNEL_URL: "https://example.trycloudflare.com",
  CARTESIA_WEBHOOK_SECRET: "whsec-test-value",
  CARTESIA_AGENT_MODEL: "claude-test",
};

const api = {} as Client;

const bodyFor = async (extra: Record<string, string | undefined>) => agentBody(await settingsFrom({ ...env, ...extra }, api), ["t1", "t2", "t3"]);

describe("the agent per scene", () => {
  test("with RASHOMON_SCENE_ID unset the agent body is byte-identical to the store agent", async () => {
    expect(`${JSON.stringify(await bodyFor({}), null, 2)}\n`).toBe(STORE_BODY);
    expect(`${JSON.stringify(await bodyFor({ RASHOMON_SCENE_ID: "" }), null, 2)}\n`).toBe(STORE_BODY);
    expect(`${JSON.stringify(await bodyFor({ RASHOMON_SCENE_ID: "store_v1" }), null, 2)}\n`).toBe(STORE_BODY);
  });

  test("with RASHOMON_SCENE_ID=room_v1 the keyterms are the six stairwell labels and no store label", async () => {
    const keyterms = (await bodyFor({ RASHOMON_SCENE_ID: "room_v1" })).config.audio.input.keyterms;
    expect(keyterms).toEqual(["top of the stairs", "north window", "east window", "west window", "south window", "ladder"]);
    expect(keyterms).toEqual(roomScene.landmarks.map((l) => l.label));
    for (const label of storeScene.landmarks.map((l) => l.label)) expect(keyterms).not.toContain(label);
  });

  test("the room interviewer's examples come from the room's labels and the store's do not appear", async () => {
    const instructions = (await bodyFor({ RASHOMON_SCENE_ID: "room_v1" })).config.instructions;
    expect(instructions).toContain('"Were you closer to the ladder or the south window?"');
    expect(instructions).toContain('"Was that before or after he reached the south window?"');
    expect(instructions).not.toMatch(/fridge|came through the door/);
    const store = (await bodyFor({})).config.instructions;
    expect(instructions.replace(/"[^"]*\?"/g, "")).toBe(store.replace(/"[^"]*\?"/g, ""));
  });

  test("an unknown RASHOMON_SCENE_ID is refused with the known scenes", async () => {
    await expect(settingsFrom({ ...env, RASHOMON_SCENE_ID: "attic_v1" }, api)).rejects.toThrow(/RASHOMON_SCENE_ID.*store_v1, room_v1/);
  });
});
