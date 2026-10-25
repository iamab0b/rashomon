import { useCallback, useEffect, useRef, useState } from "react";
import { useSceneStore } from "../store";
import { alignmentFromClick, loadScan, realignScan, type FloorClick, type LoadedScan, type ScanDeps } from "./scan";
import { useScanAlignStore } from "./scanAlignStore";
import type { ScanRequest } from "./scanRequest";

export function scanErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `The scan could not be loaded: ${detail}`;
}

export function failScan(error: unknown): void {
  console.error("scan failed", error);
  useSceneStore.getState().setStatus("error", scanErrorMessage(error));
}

export type ScanScene = {
  readonly scan: LoadedScan | null;
  readonly alignAt: (click: FloorClick) => void;
  readonly frameKey: number;
};

export function useScanScene(request: ScanRequest | null, deps: ScanDeps = {}): ScanScene {
  const [scan, setScan] = useState<LoadedScan | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const setStatus = useSceneStore((state) => state.setStatus);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    setScan(null);
    setStatus("loading");
    loadScan(request, depsRef.current)
      .then((loaded) => {
        if (cancelled) return;
        if (loaded.aligned) useScanAlignStore.getState().setMetresPerUnit(loaded.alignment.scale);
        setFrameKey((key) => key + 1);
        setScan(loaded);
      })
      .catch((error: unknown) => {
        if (!cancelled) failScan(error);
      });
    return () => {
      cancelled = true;
    };
  }, [request, setStatus]);

  const alignAt = useCallback(
    (click: FloorClick) => {
      if (!scan) return;
      const { metresPerUnit, origin, setAligning } = useScanAlignStore.getState();
      const alignment = alignmentFromClick(scan, click, metresPerUnit, origin);
      if (!alignment) return;
      setAligning(false);
      realignScan(scan, alignment, depsRef.current).then((aligned) => {
        setScan(aligned);
        setFrameKey((key) => key + 1);
      }, failScan);
    },
    [scan],
  );

  return { scan, alignAt, frameKey };
}
