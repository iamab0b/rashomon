import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSceneStore } from "../store";
import { AnimatedCharacter } from "./AnimatedCharacter";
import type { CharacterHandle } from "./Character";
import { loadClips } from "./clips";
import { measureRig } from "./measureRig";
import { RIG_DEBUG_ACTORS, RIG_DEBUG_GRAPH } from "./rigDebugGraph";
import { useRigReportStore } from "./rigReportStore";

const MEASURE_AFTER_FRAMES = 10;
const FLOOR_SIZE = 10;
const RULER_X = 4;
const RULER_Z = 3;
const RULER_HEIGHT = 1.75;
const HIP_TICK = 1.0;
const TICK_HALF = 0.1;
const RULER_COLOR = "#ffd24a";

function Ruler() {
  const tick = (y: number): [number, number, number][] => [
    [RULER_X - TICK_HALF, y, RULER_Z],
    [RULER_X + TICK_HALF, y, RULER_Z],
  ];
  return (
    <>
      <Line points={[[RULER_X, 0, RULER_Z], [RULER_X, RULER_HEIGHT, RULER_Z]]} color={RULER_COLOR} lineWidth={2} />
      <Line points={tick(HIP_TICK)} color={RULER_COLOR} lineWidth={2} />
      <Line points={tick(RULER_HEIGHT)} color={RULER_COLOR} lineWidth={2} />
    </>
  );
}

function DebugFloor() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[FLOOR_SIZE / 2 - 1, 0, FLOOR_SIZE / 2 - 2]} receiveShadow>
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
        <meshStandardMaterial color="#2a3039" />
      </mesh>
      <gridHelper args={[FLOOR_SIZE, FLOOR_SIZE, "#4a5462", "#353c47"]} position={[FLOOR_SIZE / 2 - 1, 0.001, FLOOR_SIZE / 2 - 2]} />
    </>
  );
}

export function RigDebug() {
  const [clipsLoaded, setClipsLoaded] = useState(false);
  const [handles, setHandles] = useState<readonly CharacterHandle[]>([]);
  const frames = useRef(0);
  const addReport = useRigReportStore((state) => state.addReport);
  const setStatus = useSceneStore((state) => state.setStatus);
  const setResolved = useSceneStore((state) => state.setResolved);

  useEffect(() => {
    setResolved(RIG_DEBUG_GRAPH);
    return () => setResolved(null);
  }, [setResolved]);

  useEffect(() => {
    let cancelled = false;
    loadClips()
      .then(() => {
        if (!cancelled) setClipsLoaded(true);
      })
      .catch((error: unknown) => console.error("rig debug clip load failed", error));
    return () => {
      cancelled = true;
    };
  }, []);

  const onReady = useCallback((handle: CharacterHandle) => {
    setHandles((current) => [...current.filter((existing) => existing.rig !== handle.rig), handle]);
  }, []);

  useFrame(() => {
    if (!clipsLoaded || handles.length !== RIG_DEBUG_ACTORS.length) return;
    frames.current += 1;
    if (frames.current !== MEASURE_AFTER_FRAMES) return;
    for (const handle of handles) {
      const report = measureRig(handle);
      addReport(report);
      console.info(
        `rig ${report.rig}: hip bone ${report.hipBone}, hip y ${report.hipY.toFixed(3)} m, height ${report.height.toFixed(3)} m`,
      );
    }
    setStatus("ready");
  });

  return (
    <>
      <DebugFloor />
      <Ruler />
      {RIG_DEBUG_ACTORS.map((actor) => (
        <AnimatedCharacter
          key={actor.id}
          actorId={actor.id}
          rig={actor.rig}
          position={actor.position}
          onReady={onReady}
        />
      ))}
    </>
  );
}
