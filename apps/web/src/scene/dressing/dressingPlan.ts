import type { Vec3 } from "@rashomon/engine";
import type { SceneManifest } from "@rashomon/schema";

type Landmark = SceneManifest["landmarks"][number];
type Axis = "x" | "z";
type Facing = "+x" | "-x" | "+z" | "-z";

export type DressingFit =
  | { readonly kind: "box"; readonly size: Vec3 }
  | { readonly kind: "longest"; readonly meters: number };

export type DressingPlacement = {
  readonly url: string;
  readonly landmarkId: string;
  readonly role: "unit" | "item";
  readonly position: Vec3;
  readonly rotationY: number;
  readonly fit: DressingFit;
};

const DRESSING_DIR = "/dressing";
const SHELF_URL = `${DRESSING_DIR}/shelf_unit.glb`;
const COUNTER_URL = `${DRESSING_DIR}/counter.glb`;
const COOLER_URL = `${DRESSING_DIR}/cooler.glb`;
const DOOR_URL = `${DRESSING_DIR}/door.glb`;
const ITEM_COUNT = 8;
const ITEM_URLS: readonly string[] = Array.from(
  { length: ITEM_COUNT },
  (_, index) => `${DRESSING_DIR}/item_${String(index + 1).padStart(2, "0")}.glb`,
);

const SHELF_UNIT_LENGTH_M = 1;
const SHELF_GAP_M = 0.05;
const COUNTER_UNIT_LENGTH_M = 0.9;
const COUNTER_GAP_M = 0.02;
const COOLER_UNIT_WIDTH_M = 0.75;
const COOLER_GAP_M = 0.02;
const DOOR_FRAME_DEPTH_M = 0.2;
const ITEM_LONGEST_M = 0.2;
const ITEM_EDGE_MARGIN_M = 0.15;
const ITEM_SEED = 1307;
const FULL_TURN = Math.PI * 2;
const UINT32_RANGE = 4294967296;

const FACING_YAW: Readonly<Record<Facing, number>> = {
  "+z": 0,
  "-z": Math.PI,
  "+x": Math.PI / 2,
  "-x": -Math.PI / 2,
};

type Cell = { readonly offset: number; readonly length: number };

function splitLine(length: number, unitLength: number, gap: number): readonly Cell[] {
  const count = Math.max(1, Math.floor((length + gap) / (unitLength + gap)));
  const cellLength = (length - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    offset: cellLength / 2 + index * (cellLength + gap),
    length: cellLength,
  }));
}

function facingFor(longAxis: Axis, crossCenter: number, referenceCross: number): Facing {
  const towardLow = crossCenter > referenceCross;
  if (longAxis === "z") return towardLow ? "-x" : "+x";
  return towardLow ? "-z" : "+z";
}

function referenceCenter(manifest: SceneManifest, landmark: Landmark): readonly [number, number] {
  const interior = manifest.interior;
  if (interior) return [(interior.min[0] + interior.max[0]) / 2, (interior.min[2] + interior.max[2]) / 2];
  const { min, max } = landmark.bounds;
  return [(min[0] + max[0]) / 2, (min[2] + max[2]) / 2];
}

type LineSpec = {
  readonly url: string;
  readonly unitLength: number;
  readonly gap: number;
  readonly maxThickness: number;
};

function lineOf(manifest: SceneManifest, landmark: Landmark, spec: LineSpec): readonly DressingPlacement[] {
  const { min, max } = landmark.bounds;
  const extentX = max[0] - min[0];
  const extentZ = max[2] - min[2];
  const height = max[1] - min[1];
  const longAxis: Axis = extentZ >= extentX ? "z" : "x";
  const length = longAxis === "z" ? extentZ : extentX;
  const cross = longAxis === "z" ? extentX : extentZ;
  const crossMin = longAxis === "z" ? min[0] : min[2];
  const crossMax = longAxis === "z" ? max[0] : max[2];
  const longMin = longAxis === "z" ? min[2] : min[0];
  const [referenceX, referenceZ] = referenceCenter(manifest, landmark);
  const referenceCross = longAxis === "z" ? referenceX : referenceZ;
  const crossCenter = (crossMin + crossMax) / 2;
  const thickness = Math.min(cross, spec.maxThickness);
  const flushToHigh = crossCenter > referenceCross;
  const crossPosition =
    thickness < cross ? (flushToHigh ? crossMax - thickness / 2 : crossMin + thickness / 2) : crossCenter;
  const rotationY = FACING_YAW[facingFor(longAxis, crossCenter, referenceCross)];

  return splitLine(length, spec.unitLength, spec.gap).map((cell) => {
    const along = longMin + cell.offset;
    return {
      url: spec.url,
      landmarkId: landmark.id,
      role: "unit",
      position: longAxis === "z" ? [crossPosition, min[1], along] : [along, min[1], crossPosition],
      rotationY,
      fit: {
        kind: "box",
        size: longAxis === "z" ? [thickness, height, cell.length] : [cell.length, height, thickness],
      },
    };
  });
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

function between(low: number, high: number, unit: number): number {
  return low + (high - low) * unit;
}

function scatterItems(shelves: readonly Landmark[]): readonly DressingPlacement[] {
  const random = seededRandom(ITEM_SEED);
  return ITEM_URLS.flatMap((url, index) => {
    const shelf = shelves[index % shelves.length];
    if (!shelf) return [];
    const { min, max } = shelf.bounds;
    const marginX = Math.min(ITEM_EDGE_MARGIN_M, (max[0] - min[0]) / 4);
    const marginZ = Math.min(ITEM_EDGE_MARGIN_M, (max[2] - min[2]) / 4);
    const x = between(min[0] + marginX, max[0] - marginX, random());
    const z = between(min[2] + marginZ, max[2] - marginZ, random());
    const rotationY = random() * FULL_TURN;
    return [
      {
        url,
        landmarkId: shelf.id,
        role: "item" as const,
        position: [x, max[1], z] as Vec3,
        rotationY,
        fit: { kind: "longest" as const, meters: ITEM_LONGEST_M },
      },
    ];
  });
}

function isShelf(landmark: Landmark): boolean {
  return landmark.kind === "furniture" && landmark.id.startsWith("shelf");
}

export function dressingPlan(manifest: SceneManifest): readonly DressingPlacement[] {
  const shelves = manifest.landmarks.filter(isShelf);
  const counters = manifest.landmarks.filter((landmark) => landmark.id === "counter");
  const coolers = manifest.landmarks.filter((landmark) => landmark.id === "cooler");
  const doors = manifest.landmarks.filter((landmark) => landmark.kind === "door");
  const shelfSpec: LineSpec = { url: SHELF_URL, unitLength: SHELF_UNIT_LENGTH_M, gap: SHELF_GAP_M, maxThickness: Infinity };
  const counterSpec: LineSpec = { url: COUNTER_URL, unitLength: COUNTER_UNIT_LENGTH_M, gap: COUNTER_GAP_M, maxThickness: Infinity };
  const coolerSpec: LineSpec = { url: COOLER_URL, unitLength: COOLER_UNIT_WIDTH_M, gap: COOLER_GAP_M, maxThickness: Infinity };
  const doorSpec: LineSpec = { url: DOOR_URL, unitLength: Infinity, gap: 0, maxThickness: DOOR_FRAME_DEPTH_M };
  return [
    ...shelves.flatMap((landmark) => lineOf(manifest, landmark, shelfSpec)),
    ...counters.flatMap((landmark) => lineOf(manifest, landmark, counterSpec)),
    ...coolers.flatMap((landmark) => lineOf(manifest, landmark, coolerSpec)),
    ...doors.flatMap((landmark) => lineOf(manifest, landmark, doorSpec)),
    ...scatterItems(shelves),
  ];
}

export function dressingUrls(plan: readonly DressingPlacement[]): readonly string[] {
  return [...new Set(plan.map((placement) => placement.url))];
}
