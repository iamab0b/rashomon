import type { ReducerCtx } from "spacetimedb/server";
import type { ModuleSchema } from "./graph";

export const NOT_AN_EDITOR = "only editors can add statements";

const normalize = (identity: string): string => identity.trim().toLowerCase().replace(/^0x/, "");

export function editorList(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map(normalize).filter((s) => s !== ""));
}

const readList = (ctx: Pick<ReducerCtx<ModuleSchema>, "env">): string | undefined => {
  try {
    return ctx.env.EDITOR_IDENTITIES;
  } catch {
    return undefined;
  }
};

export function isEditor(ctx: Pick<ReducerCtx<ModuleSchema>, "sender" | "databaseIdentity" | "env">): boolean {
  if (ctx.sender.isEqual(ctx.databaseIdentity)) return true;
  return editorList(readList(ctx)).has(normalize(ctx.sender.toHexString()));
}
