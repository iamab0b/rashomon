import { LAYER_COLORS, type WitnessLayer } from "../scene";
import type { WitnessTag } from "./shared";

export function witnessColor(layers: readonly WitnessLayer[], witnessId: string): string {
  const index = layers.findIndex((layer) => layer.id === witnessId);
  return LAYER_COLORS[(index < 0 ? 0 : index) % LAYER_COLORS.length]!;
}

export function witnessName(layers: readonly WitnessLayer[], witnessId: string): string {
  return layers.find((layer) => layer.id === witnessId)?.label ?? witnessId;
}

export function witnessTagOf(layers: readonly WitnessLayer[], witnessId: string): WitnessTag | null {
  if (layers.length < 2) return null;
  return { id: witnessId, label: witnessName(layers, witnessId), color: witnessColor(layers, witnessId) };
}
