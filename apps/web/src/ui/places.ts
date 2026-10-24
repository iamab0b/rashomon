import { storeScene } from "@rashomon/schema/fixtures";

type Vec3 = readonly [number, number, number];

type Landmark = { id: string; label: string; position: Vec3 };

const LANDMARKS: Record<string, readonly Landmark[]> = {
  [storeScene.sceneId]: storeScene.landmarks,
};

const round = (n: number) => Number(n.toFixed(1));

export function placeName(sceneId: string, id: string): string {
  return LANDMARKS[sceneId]?.find((landmark) => landmark.id === id)?.label ?? id.replace(/_/g, " ");
}

export function pointLabel(sceneId: string, point: Vec3): string {
  const match = LANDMARKS[sceneId]?.find(
    (landmark) => landmark.position[0] === point[0] && landmark.position[2] === point[2],
  );
  return match?.label ?? `(${round(point[0])}, ${round(point[2])})`;
}

export function eventPlace(
  sceneId: string,
  event: { at?: Vec3; from?: Vec3; to?: Vec3 },
): string {
  if (event.from && event.to) return `${pointLabel(sceneId, event.from)} → ${pointLabel(sceneId, event.to)}`;
  const point = event.at ?? event.to ?? event.from;
  return point ? pointLabel(sceneId, point) : "no place recorded";
}
