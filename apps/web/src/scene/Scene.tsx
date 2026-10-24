import { Canvas } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { CameraRig } from "./cameras/CameraRig";
import { CAMERA_PRESETS } from "./cameras/presets";
import { DebugOverlay } from "./DebugOverlay";
import { FloorProbe } from "./FloorProbe";
import { FpsProbe } from "./FpsProbe";
import { LabelLayer } from "./landmarks/LabelLayer";
import { LabelProjector } from "./landmarks/LabelProjector";
import { LandmarkMarkers } from "./landmarks/LandmarkMarkers";
import { loadScene, type LoadedScene } from "./loaders/scene";
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
};

function useLoadedScene(fixture: string | undefined): LoadedScene | null {
  const [loaded, setLoaded] = useState<LoadedScene | null>(null);
  const setReady = useSceneStore((state) => state.setReady);

  useEffect(() => {
    if (!fixture) return;
    let cancelled = false;
    setReady(false);
    loadScene(fixture)
      .then((result) => {
        if (!cancelled) setLoaded(result);
      })
      .catch((error: unknown) => {
        console.error("scene load failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, [fixture, setReady]);

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
  const setReady = useSceneStore((state) => state.setReady);
  useEffect(() => {
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    return () => cancelAnimationFrame(frame);
  }, [setReady]);
  return null;
}

export function Scene({ fixture }: SceneProps) {
  useSceneKeys();
  const loaded = useLoadedScene(fixture);
  const ready = useSceneStore((state) => state.ready);
  const initial = CAMERA_PRESETS[useSceneStore.getState().preset];

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%" }}
      data-scene-ready={ready ? "true" : "false"}
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
        {loaded ? (
          <>
            <primitive object={loaded.model} />
            <LandmarkMarkers landmarks={loaded.manifest.landmarks} />
            <LabelProjector landmarks={loaded.manifest.landmarks} occluders={loaded.model} />
            <FloorProbe interior={loaded.manifest.interior} />
            <ReadySignal />
          </>
        ) : null}
      </Canvas>
      {loaded ? <LabelLayer landmarks={loaded.manifest.landmarks} /> : null}
      <DebugOverlay />
    </div>
  );
}
