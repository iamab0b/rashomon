import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AnimationAction, AnimationClip } from "three";
import { useSceneStore } from "../store";
import { Character, type CharacterHandle } from "./Character";
import { loadClips } from "./clips";
import { measureRig } from "./measureRig";
import { useRigReportStore } from "./rigReportStore";
import type { Rig } from "./rigs";

const DEBUG_CLIP = "clip_idle";
const MEASURE_AFTER_FRAMES = 10;
const FLOOR_SIZE = 10;
const RULER_X = 4;
const RULER_Z = 3;
const RULER_HEIGHT = 1.75;
const HIP_TICK = 1.0;
const TICK_HALF = 0.1;
const RULER_COLOR = "#ffd24a";

const DEBUG_ACTORS: readonly { rig: Rig; position: readonly [number, number, number] }[] = [
  { rig: "mixamo_ybot", position: [3, 0, 3] },
  { rig: "mixamo_xbot", position: [5, 0, 3] },
];

type Playing = { handle: CharacterHandle; action: AnimationAction; clip: AnimationClip };

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
  const [clip, setClip] = useState<AnimationClip | null>(null);
  const [handles, setHandles] = useState<readonly CharacterHandle[]>([]);
  const playing = useRef<readonly Playing[]>([]);
  const frames = useRef(0);
  const addReport = useRigReportStore((state) => state.addReport);
  const setReady = useSceneStore((state) => state.setReady);

  useEffect(() => {
    let cancelled = false;
    loadClips()
      .then((clips) => {
        const idle = clips.get(DEBUG_CLIP);
        if (!idle) throw new Error(`${DEBUG_CLIP} missing from clip cache`);
        if (!cancelled) setClip(idle);
      })
      .catch((error: unknown) => console.error("rig debug clip load failed", error));
    return () => {
      cancelled = true;
    };
  }, []);

  const onReady = useCallback((handle: CharacterHandle) => {
    setHandles((current) => [...current.filter((existing) => existing.rig !== handle.rig), handle]);
  }, []);

  useEffect(() => {
    if (!clip) return;
    playing.current = handles.map((handle) => {
      const action = handle.mixer.clipAction(clip);
      action.play();
      return { handle, action, clip };
    });
    frames.current = 0;
  }, [clip, handles]);

  useFrame(({ clock }) => {
    const current = playing.current;
    if (current.length === 0) return;
    for (const { handle, action, clip: playingClip } of current) {
      action.time = clock.elapsedTime % playingClip.duration;
      handle.mixer.update(0);
    }
    frames.current += 1;
    if (frames.current !== MEASURE_AFTER_FRAMES) return;
    for (const { handle } of current) {
      const report = measureRig(handle);
      addReport(report);
      console.info(
        `rig ${report.rig}: hip bone ${report.hipBone}, hip y ${report.hipY.toFixed(3)} m, height ${report.height.toFixed(3)} m`,
      );
    }
    if (current.length === DEBUG_ACTORS.length) setReady(true);
  });

  return (
    <>
      <DebugFloor />
      <Ruler />
      {DEBUG_ACTORS.map((actor) => (
        <Character key={actor.rig} rig={actor.rig} position={actor.position} onReady={onReady} />
      ))}
    </>
  );
}
