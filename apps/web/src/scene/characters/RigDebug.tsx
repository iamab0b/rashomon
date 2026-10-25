import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSceneStore } from "../store";
import { AnimatedCharacter } from "./AnimatedCharacter";
import type { CharacterHandle } from "./Character";
import { getClip, loadClips, loadOptionalClips } from "./clips";
import { measureRig } from "./measureRig";
import { rigDebugActors, rigDebugBodies, rigDebugClipLines, rigDebugGraph, type DebugActor } from "./rigDebugGraph";
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

function reportName(actor: DebugActor, handle: CharacterHandle): string {
  if (actor.body === undefined || handle.body === actor.body) return handle.name;
  return `${actor.body} (refused, drawn as ${handle.rig})`;
}

export function RigDebug() {
  const { bodies, unknown } = useMemo(() => rigDebugBodies(window.location.search), []);
  const actors = useMemo(() => rigDebugActors(bodies), [bodies]);
  const graph = useMemo(() => rigDebugGraph(bodies), [bodies]);
  const [clipsLoaded, setClipsLoaded] = useState(false);
  const [handles, setHandles] = useState<ReadonlyMap<string, CharacterHandle>>(() => new Map());
  const frames = useRef(0);
  const addReport = useRigReportStore((state) => state.addReport);
  const setClipLines = useRigReportStore((state) => state.setClipLines);
  const setStatus = useSceneStore((state) => state.setStatus);
  const setResolved = useSceneStore((state) => state.setResolved);

  useEffect(() => {
    if (unknown !== undefined) console.warn(`debug=rig: body ${unknown} is not one of the six bodies`);
  }, [unknown]);

  useEffect(() => {
    setResolved(graph);
    return () => setResolved(null);
  }, [setResolved, graph]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadClips(), loadOptionalClips()])
      .then(() => {
        if (cancelled) return;
        setClipLines(rigDebugClipLines((name) => getClip(name) !== undefined));
        setClipsLoaded(true);
      })
      .catch((error: unknown) => console.error("rig debug clip load failed", error));
    return () => {
      cancelled = true;
    };
  }, [setClipLines]);

  const onReady = useMemo(
    () =>
      new Map(
        actors.map((actor) => [
          actor.id,
          (handle: CharacterHandle) => setHandles((current) => new Map([...current, [actor.id, handle]])),
        ]),
      ),
    [actors],
  );

  useFrame(() => {
    if (!clipsLoaded || handles.size !== actors.length) return;
    frames.current += 1;
    if (frames.current !== MEASURE_AFTER_FRAMES) return;
    for (const actor of actors) {
      const handle = handles.get(actor.id);
      if (!handle) continue;
      const report = measureRig(handle, reportName(actor, handle));
      addReport(report);
      console.info(
        `rig ${report.name}: ${report.bones} bones, hip bone ${report.hipBone}, hip y ${report.hipY.toFixed(3)} m, eye y ${report.eyeY.toFixed(3)} m${report.eyeEstimated ? " (est.)" : ""}, height ${report.height.toFixed(3)} m`,
      );
    }
    setStatus("ready");
  });

  return (
    <>
      <DebugFloor />
      <Ruler />
      {actors.map((actor) => (
        <AnimatedCharacter
          key={actor.id}
          actorId={actor.id}
          look={actor.body === undefined ? { rig: actor.rig } : { rig: actor.rig, body: actor.body }}
          position={actor.position}
          onReady={onReady.get(actor.id)}
        />
      ))}
    </>
  );
}
