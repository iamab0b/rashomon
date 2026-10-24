import type { SceneManifest } from "@rashomon/schema";
import { useEffect, useMemo, useState } from "react";
import type { Object3D } from "three";
import { loadGlb } from "../loaders/scene";
import { modelExists } from "../loaders/modelExists";
import { assembleDressing, type AssembledDressing } from "./assemble";
import { dressingPlan, dressingUrls } from "./dressingPlan";
import { loadDressingModels } from "./loadDressing";
import { hidePlaceholderBoxes } from "./placeholders";

type Props = {
  manifest: SceneManifest;
  placeholder: Object3D;
};

export function Dressing({ manifest, placeholder }: Props) {
  const plan = useMemo(() => dressingPlan(manifest), [manifest]);
  const [assembled, setAssembled] = useState<AssembledDressing | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDressingModels(dressingUrls(plan), modelExists, loadGlb)
      .then((models) => {
        if (!cancelled) setAssembled(assembleDressing(plan, models));
      })
      .catch((error: unknown) => console.error("store dressing failed to load", error));
    return () => {
      cancelled = true;
    };
  }, [plan]);

  useEffect(() => {
    if (!assembled) return;
    return hidePlaceholderBoxes(placeholder, assembled.coveredLandmarks);
  }, [assembled, placeholder]);

  return assembled ? <primitive object={assembled.group} /> : null;
}
