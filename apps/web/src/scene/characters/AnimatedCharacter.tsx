import type { SceneManifest } from "@rashomon/schema";
import { useCallback, useState } from "react";
import { Character, type CharacterHandle } from "./Character";
import type { Rig } from "./rigs";
import { useActorAnimation } from "./useActorAnimation";

type Props = {
  actorId: string;
  rig: Rig;
  position: readonly [number, number, number];
  manifest?: SceneManifest;
  onReady?: (handle: CharacterHandle) => void;
};

export function AnimatedCharacter({ actorId, rig, position, manifest, onReady }: Props) {
  const [handle, setHandle] = useState<CharacterHandle | null>(null);
  useActorAnimation(actorId, handle, manifest);

  const handleReady = useCallback(
    (ready: CharacterHandle) => {
      setHandle(ready);
      onReady?.(ready);
    },
    [onReady],
  );

  return <Character rig={rig} position={position} onReady={handleReady} />;
}
