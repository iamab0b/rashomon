export type PropCollider = "cuboid" | "ball" | "hull";

export type PropDimensions = { l: number; w: number; h: number };

export type PropType = {
  type: string;
  label: string;
  aliases: string[];
  modelUrl: string;
  dimensionsM: PropDimensions;
  massKg: number;
  graspable: boolean;
  collider: PropCollider;
  gripOffset: [number, number, number];
  defaultNotes: string;
  source: string;
};

export type PropLibrary = PropType[];

const COLLIDERS: readonly string[] = ["cuboid", "ball", "hull"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseLibrary(json: unknown): PropLibrary {
  const errors: string[] = [];
  if (!Array.isArray(json)) {
    throw new Error("props library: expected an array of entries");
  }
  const seen = new Set<string>();
  json.forEach((raw: unknown, i) => {
    if (!isRecord(raw)) {
      errors.push(`entry ${i}: not an object`);
      return;
    }
    const name = typeof raw.type === "string" && raw.type !== "" ? raw.type : `#${i}`;
    const at = `entry ${name}`;
    if (typeof raw.type !== "string" || raw.type === "") {
      errors.push(`${at}: type must be a non-empty string`);
    } else if (seen.has(raw.type)) {
      errors.push(`${at}: duplicate type`);
    } else {
      seen.add(raw.type);
    }
    for (const key of ["label", "modelUrl", "defaultNotes", "source"] as const) {
      if (typeof raw[key] !== "string") errors.push(`${at}: ${key} must be a string`);
    }
    if (typeof raw.massKg !== "number" || !Number.isFinite(raw.massKg)) {
      errors.push(`${at}: massKg must be a number`);
    }
    if (typeof raw.graspable !== "boolean") errors.push(`${at}: graspable must be a boolean`);
    const dims = raw.dimensionsM;
    if (!isRecord(dims)) {
      errors.push(`${at}: dimensionsM missing`);
    } else {
      for (const k of ["l", "w", "h"]) {
        const v = dims[k];
        if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
          errors.push(`${at}: dimensionsM.${k} must be a positive number`);
        }
      }
    }
    if (typeof raw.collider !== "string" || !COLLIDERS.includes(raw.collider)) {
      errors.push(`${at}: collider must be one of cuboid, ball, hull`);
    }
    const grip = raw.gripOffset;
    const gripOk =
      Array.isArray(grip) && grip.length === 3 && grip.every((n) => typeof n === "number" && Number.isFinite(n));
    if (raw.graspable === true && !gripOk) {
      errors.push(`${at}: graspable prop requires gripOffset`);
    } else if (grip !== undefined && !gripOk) {
      errors.push(`${at}: gripOffset must be [x, y, z] numbers`);
    }
    const aliases = raw.aliases;
    if (
      !Array.isArray(aliases) ||
      aliases.length === 0 ||
      !aliases.every((a) => typeof a === "string" && a.trim() !== "")
    ) {
      errors.push(`${at}: aliases must be a non-empty array of non-empty strings`);
    }
  });
  if (errors.length > 0) {
    throw new Error(`invalid props library (${errors.length} violations):\n${errors.join("\n")}`);
  }
  return json as PropLibrary;
}
