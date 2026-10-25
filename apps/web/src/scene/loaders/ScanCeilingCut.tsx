import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import type { LoadedScan } from "./scan";
import { ceilingCutActive, createCeilingCut, scanFloorY } from "./scanCeilingCut";

export function ScanCeilingCut({ scan }: { scan: LoadedScan }) {
  const gl = useThree((state) => state.gl);
  const floorY = useMemo(() => scanFloorY(scan.aligned, scan.geom), [scan.aligned, scan.geom]);
  const cut = useMemo(() => createCeilingCut(scan.raw, floorY), [scan.raw, floorY]);

  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);

  useEffect(() => () => void cut.set(false), [cut]);

  useFrame((state) => {
    cut.set(ceilingCutActive(state.camera.position.y, floorY));
  });

  return null;
}
