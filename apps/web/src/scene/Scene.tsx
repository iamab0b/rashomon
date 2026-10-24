import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { CameraRig } from "./cameras/CameraRig";
import { PovRayLine } from "./cameras/PovRayLine";
import { WitnessView } from "./cameras/WitnessView";
import { CAMERA_PRESETS } from "./cameras/presets";
import { RigDebug } from "./characters/RigDebug";
import { RigReportPanel } from "./characters/RigReportPanel";
import { DebugOverlay } from "./DebugOverlay";
import { FloorProbe } from "./FloorProbe";
import { FpsProbe } from "./FpsProbe";
import { LabelLayer } from "./landmarks/LabelLayer";
import { LabelProjector } from "./landmarks/LabelProjector";
import { LandmarkMarkers } from "./landmarks/LandmarkMarkers";
import { loadScene, type LoadedScene } from "./loaders/scene";
import { Actors } from "./playback/Actors";
import { fixtureGraphSource } from "./playback/graphSource";
import { Playhead } from "./playback/Playhead";
import { ScrubBar } from "./playback/ScrubBar";
import { useGraphSource } from "./playback/useGraph";
import { useSceneStore } from "./store";
import { useSceneKeys } from "./useSceneKeys";

const BACKGROUND = "#0b0d10";
const AMBIENT_INTENSITY = 0.6;
const SUN_INTENSITY = 1.6;
const SUN_POSITION: [number, number, number] = [6, 10, 3];
const SHADOW_MAP_SIZE = 2048;
const SHADOW_EXTENT = 8;
const SHADOW_RADIUS = 4;
const INITIAL_FOV = 50;

export type SceneProps = {
  fixture?: string;
  debug?: string;
  t?: number;
};

const RIG_DEBUG = "rig";

function useLoadedScene(fixture: string | undefined): LoadedScene | null {
  const [loaded, setLoaded] = useState<LoadedScene | null>(null);
  const setStatus = useSceneStore((state) => state.setStatus);

  useEffect(() => {
    if (!fixture) return;
    let cancelled = false;
    setStatus("loading");
    loadScene(fixture)
      .then((result) => {
        if (!cancelled) setLoaded(result);
      })
      .catch((error: unknown) => {
        console.error("scene load failed", error);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [fixture, setStatus]);

  return loaded;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={AMBIENT_INTENSITY} />
      <directionalLight
        position={SUN_POSITION}
        intensity={SUN_INTENSITY}
        castShadow
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-radius={SHADOW_RADIUS}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
      />
    </>
  );
}

function ReadySignal() {
  const setStatus = useSceneStore((state) => state.setStatus);
  useEffect(() => {
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setStatus("ready")));
    return () => cancelAnimationFrame(frame);
  }, [setStatus]);
  return null;
}

function useInitialTime(t: number | undefined, debug: string | undefined): void {
  const setT = useSceneStore((state) => state.setT);
  const setPlaying = useSceneStore((state) => state.setPlaying);
  useEffect(() => {
    if (t !== undefined) {
      setT(t);
      setPlaying(false);
      return;
    }
    setPlaying(debug === RIG_DEBUG);
  }, [t, debug, setT, setPlaying]);
}

function useDebugPreset(debug: string | undefined): void {
  const setPreset = useSceneStore((state) => state.setPreset);
  useEffect(() => {
    if (debug === RIG_DEBUG) setPreset("rig_debug");
  }, [debug, setPreset]);
}

export function Scene({ fixture, debug, t }: SceneProps) {
  useSceneKeys();
  useDebugPreset(debug);
  useInitialTime(t, debug);
  const isRigDebug = debug === RIG_DEBUG;
  const loaded = useLoadedScene(isRigDebug ? undefined : fixture);
  const graphSource = useMemo(
    () => (!isRigDebug && fixture ? fixtureGraphSource(fixture) : null),
    [isRigDebug, fixture],
  );
  useGraphSource(graphSource);
  const hasGraph = useSceneStore((state) => state.resolved !== null);
  const actorsReady = useSceneStore((state) => state.actorsReady);
  const status = useSceneStore((state) => state.status);
  const initial = CAMERA_PRESETS[useSceneStore.getState().preset];

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%" }}
      data-scene-ready={status === "ready" ? "true" : status === "error" ? "error" : "false"}
    >
      <Canvas
        shadows="percentage"
        gl={{ preserveDrawingBuffer: true }}
        camera={{ position: [...initial.position], fov: INITIAL_FOV }}
      >
        <color attach="background" args={[BACKGROUND]} />
        <Lights />
        <CameraRig />
        <FpsProbe />
        <Playhead />
        {isRigDebug ? <RigDebug /> : null}
        {loaded ? (
          <>
            <primitive object={loaded.model} />
            <LandmarkMarkers landmarks={loaded.manifest.landmarks} />
            <LabelProjector landmarks={loaded.manifest.landmarks} occluders={loaded.model} />
            <FloorProbe interior={loaded.manifest.interior} />
            <WitnessView model={loaded.model} manifest={loaded.manifest} />
            <PovRayLine />
            {hasGraph ? <Actors /> : null}
            {!hasGraph || actorsReady ? <ReadySignal /> : null}
          </>
        ) : null}
      </Canvas>
      {loaded ? <LabelLayer landmarks={loaded.manifest.landmarks} /> : null}
      {isRigDebug ? <RigReportPanel /> : null}
      <ScrubBar />
      <DebugOverlay />
    </div>
  );
}
