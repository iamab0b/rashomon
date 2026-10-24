import type { Event, Patch, SceneManifest } from "@rashomon/schema";
import { anchorDropPatch, type DropField } from "./anchorDrop";

export type DropOutcome = { kind: "unchanged" } | { kind: "sent"; patch: Patch } | { kind: "failed"; message: string };

export type DropTarget = {
  readonly id: string;
  readonly field: DropField;
};

export type DropDeps = {
  readonly manifest: SceneManifest;
  readonly eventOf: (id: string) => Event | undefined;
  readonly applyPatches: (patches: readonly Patch[]) => void;
  readonly setActionError: (message: string | null) => void;
  readonly by?: string;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function commitDrop(target: DropTarget, point: readonly [number, number, number], deps: DropDeps): DropOutcome {
  deps.setActionError(null);
  const current = deps.eventOf(target.id) ?? { id: target.id };
  const patch = anchorDropPatch(current, target.field, point, deps.manifest, deps.by);
  if (!patch) return { kind: "unchanged" };
  try {
    deps.applyPatches([patch]);
    return { kind: "sent", patch };
  } catch (error) {
    const message = messageOf(error);
    deps.setActionError(message);
    return { kind: "failed", message };
  }
}
