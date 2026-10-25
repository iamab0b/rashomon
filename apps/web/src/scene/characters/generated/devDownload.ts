import type { MotionDownload } from "./loadGeneratedMotion";

export const devDownload: MotionDownload = async (characterId, motionId) => {
  const response = await fetch(`/__uthana/motion/${characterId}/${motionId}.glb`);
  if (!response.ok) throw new Error(`dev server answered ${response.status} for generated motion ${motionId}`);
  return response.arrayBuffer();
};
