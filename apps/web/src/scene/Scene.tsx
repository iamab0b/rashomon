import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { Box3 } from "three";
import type { SceneManifest } from "@rashomon/schema";
import { CameraRig } from "./cameras/CameraRig";
import { PovRayLine } from "./cameras/PovRayLine";
import { WitnessView } from "./cameras/WitnessView";
import { CAMERA_PRESETS } from "./cameras/presets";
import { RigDebug } from "./characters/RigDebug";
import { RigReportPanel } from "./characters/RigReportPanel";
import { DebugOverlay } from "./DebugOverlay";
import { Dressing } from "./dressing/Dressing";
import { AnchorGizmo } from "./editing/AnchorGizmo";
import { FloorProbe } from "./FloorProbe";
import { ShotButton } from "./export/ShotButton";
import { FpsProbe } from "./FpsProbe";
import { LabelLayer } from "./landmarks/LabelLayer";
import { LabelProjector } from "./landmarks/LabelProjector";
import { LandmarkMarkers } from "./landmarks/LandmarkMarkers";
import { EditorLayer } from "./labeling/EditorLayer";
import { LabelingPanel } from "./labeling/LabelingPanel";
import { interiorFromBounds } from "./labeling/interior";
import { useLabelingStore } from "./labeling/labelingStore";
import { isLandmarkEditing, manifestSourceFromSearch } from "./labeling/storage";
import { isKnownFixture, loadManifest, loadScene, loadSceneFromManifest, type LoadedScene } from "./loaders/scene";
import { Actors } from "./playback/Actors";
import { Playhead } from "./playback/Playhead";
import { Props } from "./props/Props";
import { selectSource } from "./playback/selectSource";
import { useGraphSource } from "./playback/useGraph";
import { SceneErrorCard } from "./SceneErrorCard";
import { sceneFailure, shouldSignalReady, unknownFixtureMessage } from "./sceneFailure";
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
const STORE_FIXTURE = "store";

function useLoadedScene(fixture: string | undefined, manifest: SceneManifest | null, editing: boolean): LoadedScene | null {
  const [loaded, setLoaded] = useState<LoadedScene | null>(null);
  const setStatus = useSceneStore((state) => state.setStatus);
  const meshKey = manifest ? `${manifest.sceneId}|${manifest.meshUrl}` : null;

  useEffect(() => {
    if (!fixture) return;
    let cancelled = false;
    setStatus("loading");
    const source = manifest
      ? loadSceneFromManifest(editing ? { ...manifest, landmarks: [] } : manifest)
      : loadScene(fixture);
    source
      .then((result) => {
        if (!cancelled) setLoaded(result);
      })
      .catch((error: unknown) => {
        console.error("scene load failed", error);
        if (cancelled) return;
        const detail = error instanceof Error ? error.message : String(error);
        setStatus("error", isKnownFixture(fixture) ? `The scene could not be loaded: ${detail}` : unknownFixtureMessage(fixture));
      });
    return () => {
      cancelled = true;
    };
  }, [fixture, meshKey, editing, setStatus]);

  return loaded;
}

function useEditorBounds(loaded: LoadedScene | null, editing: boolean): void {
  const setInterior = useLabelingStore((state) => state.setInterior);
  useEffect(() => {
    if (!editing || !loaded) return;
    const fallback = useLabelingStore.getState().base?.interior;
    if (loaded.isPlaceholder) {
      setInterior(fallback);
      return;
    }
    const box = new Box3().setFromObject(loaded.model);
    setInterior(interiorFromBounds(box.min.toArray(), box.max.toArray(), fallback));
  }, [loaded, editing, setInterior]);
}

function useSceneFailure(fixture: string | undefined, skip: boolean, hasGraphSource: boolean): string | null {
  const setStatus = useSceneStore((state) => state.setStatus);
  const failure = useMemo(
    () => (!fixture || skip ? null : sceneFailure(fixture, window.location.search, hasGraphSource)),
    [fixture, skip, hasGraphSource],
  );
  useEffect(() => {
    if (failure) setStatus("error", failure);
  }, [failure, setStatus]);
  return failure;
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
  const editing = !isRigDebug && isLandmarkEditing(window.location.search);
  const manifestSource = useMemo(() => manifestSourceFromSearch(window.location.search), []);
  const manifestError = manifestSource.kind === "error" ? manifestSource.error : null;
  const savedManifest = manifestSource.kind === "ok" ? manifestSource.manifest : null;
  const editBase = useLabelingStore((state) => state.base);
  const startManifest = useMemo(
    () => savedManifest ?? (fixture && isKnownFixture(fixture) ? loadManifest(fixture) : null),
    [savedManifest, fixture],
  );
  const sceneManifest = editing ? (editBase ?? startManifest) : savedManifest;
  const graphless = editing || manifestSource.kind !== "none";
  const loaded = useLoadedScene(
    isRigDebug || manifestError !== null ? undefined : fixture,
    sceneManifest,
    editing,
  );
  useEffect(() => {
    if (editing && startManifest) useLabelingStore.getState().begin(startManifest);
  }, [editing, startManifest]);
  useEffect(() => {
    if (manifestError !== null) useSceneStore.getState().setStatus("error", manifestError);
  }, [manifestError]);
  useEditorBounds(loaded, editing);
  const editLandmarks = useLabelingStore((state) => state.landmarks);
  const graphSource = useMemo(
    () => (!isRigDebug && !graphless && fixture ? selectSource(window.location.search, fixture) : null),
    [isRigDebug, graphless, fixture],
  );
  useGraphSource(graphSource);
  const failure = useSceneFailure(fixture, isRigDebug || graphless, graphSource !== null);
  const shownLandmarks = editing ? editLandmarks : (loaded?.manifest.landmarks ?? []);
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
        {editing ? null : <Playhead />}
        {isRigDebug ? <RigDebug /> : null}
        {loaded ? (
          <>
            <primitive object={loaded.model} />
            {loaded.isPlaceholder && fixture === STORE_FIXTURE && !editing && savedManifest === null ? (
              <Dressing manifest={loaded.manifest} placeholder={loaded.model} />
            ) : null}
            <LandmarkMarkers landmarks={shownLandmarks} />
            <LabelProjector landmarks={shownLandmarks} occluders={loaded.model} />
            <FloorProbe interior={loaded.manifest.interior} />
            <WitnessView model={loaded.model} manifest={loaded.manifest} />
            <PovRayLine />
            {hasGraph ? <Actors /> : null}
            {hasGraph ? <Props manifest={loaded.manifest} /> : null}
            {hasGraph ? <AnchorGizmo manifest={loaded.manifest} /> : null}
            {editing ? <EditorLayer /> : null}
            {shouldSignalReady({ hasGraph, actorsReady, failure }) ? <ReadySignal /> : null}
          </>
        ) : null}
      </Canvas>
      {loaded ? <LabelLayer landmarks={shownLandmarks} /> : null}
      {editing ? <LabelingPanel /> : null}
      {isRigDebug ? <RigReportPanel /> : null}
      <SceneErrorCard />
      <DebugOverlay />
      {import.meta.env.DEV && !isRigDebug ? <ShotButton /> : null}
    </div>
  );
}
