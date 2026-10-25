import type { SceneManifest } from "@rashomon/schema";
import { useCallback, useState } from "react";
import type { CharacterLook } from "./bodies";
import { Character, type CharacterHandle } from "./Character";
import { useActorAnimation } from "./useActorAnimation";

type Props = {
  actorId: string;
  look: CharacterLook;
  position: readonly [number, number, number];
  manifest?: SceneManifest;
  onReady?: (handle: CharacterHandle) => void;
};

export function AnimatedCharacter({ actorId, look, position, manifest, onReady }: Props) {
  const [handle, setHandle] = useState<CharacterHandle | null>(null);
  useActorAnimation(actorId, handle, manifest);

  const handleReady = useCallback(
    (ready: CharacterHandle) => {
      setHandle(ready);
      onReady?.(ready);
    },
    [onReady],
  );

  return <Character look={look} position={position} onReady={handleReady} />;
}
