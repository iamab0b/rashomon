import type { SceneManifest } from "@rashomon/schema";
import roomAlignmentJson from "../../../../../packages/schema/fixtures/room.alignment.json";
import roomJson from "../../../../../packages/schema/fixtures/room.scene.json";
import { isAlignment, type Alignment } from "./alignment";

export const ROOM_FIXTURE = "room";
export const ROOM_GLB_NAME = "zatec_room.glb";
export const ROOM_MISSING_NOTE = `${ROOM_GLB_NAME} is not in apps/web/public/scans`;

export const roomScene = roomJson as unknown as SceneManifest;

export function parseRoomAlignment(value: unknown): Alignment {
  if (!isAlignment(value)) throw new Error("room.alignment.json is not an alignment");
  const { rotation, translation, scale } = value;
  return { rotation, translation, scale };
}

export const roomAlignment: Alignment = parseRoomAlignment(roomAlignmentJson);
