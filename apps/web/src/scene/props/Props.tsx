import rawProps from "@rashomon/props";
import type { SceneManifest } from "@rashomon/schema";
import { useMemo } from "react";
import { useGraph } from "../playback/useGraph";
import { getPropType } from "./library";
import { PropInstance } from "./PropInstance";
import { parseLibrary } from "./types";

const LIBRARY = parseLibrary(rawProps);

type Props = { manifest: SceneManifest };

export function Props({ manifest }: Props) {
  const { resolved, graph } = useGraph();
  const anchors = useMemo(() => new Map((graph?.props ?? []).map((p) => [p.id, p.anchor])), [graph]);
  if (!resolved) return null;
  return (
    <>
      {resolved.props.map((prop) => {
        const entry = getPropType(LIBRARY, prop.type);
        if (!entry) {
          console.warn(`prop ${prop.id} has unknown type ${prop.type}; not drawn`);
          return null;
        }
        return <PropInstance key={prop.id} prop={prop} entry={entry} anchor={anchors.get(prop.id)} manifest={manifest} />;
      })}
    </>
  );
}
