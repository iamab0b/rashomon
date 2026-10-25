import { useCallback, useSyncExternalStore } from "react";
import { useSceneStore } from "../../store";
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

export function useGeneratedCheck(): (event: GeneratedEventFields) => boolean {
  const version = useSyncExternalStore(subscribeClipRegistry, clipRegistryVersion, clipRegistryVersion);
  return useCallback((event: GeneratedEventFields) => isGeneratedEvent(event), [version]);
}

export function useIsGeneratedEvent(eventId: string | null | undefined): boolean {
  const isGenerated = useGeneratedCheck();
  const event = useSceneStore((state) => (eventId ? state.resolved?.events.find((e) => e.id === eventId) : undefined));
  return event !== undefined && isGenerated(event);
}
