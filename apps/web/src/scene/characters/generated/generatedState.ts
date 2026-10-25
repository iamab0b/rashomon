import { useCallback, useSyncExternalStore } from "react";
import { clipRegistryVersion, getClip, subscribeClipRegistry } from "../clips";
import { genClipName } from "./verb";

export type GeneratedEventFields = {
  readonly actionApproximated?: boolean;
  readonly verb?: string;
};

export function isGeneratedEvent(event: GeneratedEventFields, hasClip: (name: string) => boolean = (name) => getClip(name) !== undefined): boolean {
  if (event.actionApproximated !== true || event.verb === undefined) return false;
  const name = genClipName(event.verb);
  return name !== undefined && hasClip(name);
}

export function useIsGeneratedEvent(): (event: GeneratedEventFields) => boolean {
  const version = useSyncExternalStore(subscribeClipRegistry, clipRegistryVersion);
  return useCallback((event: GeneratedEventFields) => isGeneratedEvent(event), [version]);
}
