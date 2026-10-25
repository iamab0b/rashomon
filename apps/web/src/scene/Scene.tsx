import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { CameraRig } from "./cameras/CameraRig";
import { FrameObject } from "./cameras/FrameObject";
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
import { isKnownFixture, loadScene, type LoadedScene } from "./loaders/scene";
import { storeDroppedScan, type LoadedScan } from "./loaders/scan";
import { useScanAlignStore } from "./loaders/scanAlignStore";
import { ScanDropHint } from "./loaders/ScanDropHint";
import { ScanCeilingCut } from "./loaders/ScanCeilingCut";
import { ScanPanel } from "./loaders/ScanPanel";
import { scanFailure, scanRequestFromSearch, searchWithScan, type ScanRequest } from "./loaders/scanRequest";
import type { SceneSource } from "./loaders/sceneSource";
import { failScan, useScanScene } from "./loaders/useScanScene";
import { fixtureGraphSource, NO_GEOM, scenarioFromSearch, type GateScene } from "./playback/graphSource";
import { Actors } from "./playback/Actors";
import { Playhead } from "./playback/Playhead";
import { Props } from "./props/Props";
import { selectSource } from "./playback/selectSource";
import { useGraphSource } from "./playback/useGraph";
import { SceneErrorCard } from "./SceneErrorCard";
import { sceneFailure, scanSceneFailure, shouldSignalReady, unknownFixtureMessage } from "./sceneFailure";
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
        if (cancelled) return;
        const detail = error instanceof Error ? error.message : String(error);
        setStatus("error", isKnownFixture(fixture) ? `The scene could not be loaded: ${detail}` : unknownFixtureMessage(fixture));
      });
    return () => {
      cancelled = true;
    };
  }, [fixture, setStatus]);

  return loaded;
}

function useSceneFailure(
  fixture: string | undefined,
  skip: boolean,
  hasGraphSource: boolean,
  scan: { request: ScanRequest | null; loaded: boolean },
): string | null {
  const setStatus = useSceneStore((state) => state.setStatus);
  const failure = useMemo(
    () =>
      !fixture || skip
        ? null
        : scan.request
          ? scanSceneFailure(window.location.search, scan.loaded, hasGraphSource)
          : sceneFailure(fixture, window.location.search, hasGraphSource),
    [fixture, skip, hasGraphSource, scan.request, scan.loaded],
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

function useScanRequest(): [ScanRequest | null, (file: File) => void] {
  const [request, setRequest] = useState<ScanRequest | null>(() => scanRequestFromSearch(window.location.search));
  const latestDrop = useRef(0);
  const drop = useCallback((file: File) => {
    const serial = ++latestDrop.current;
    storeDroppedScan(file)
      .then((hash) => {
        if (serial !== latestDrop.current) return;
        const search = searchWithScan(window.location.search, hash);
        window.history.replaceState(window.history.state, "", search);
        setRequest(scanRequestFromSearch(search));
      })
      .catch((error: unknown) => {
        if (serial === latestDrop.current) failScan(error);
      });
  }, []);
  return [request, drop];
}

function scanLoadedScene(scan: LoadedScan | null): LoadedScene | null {
  return scan ? { manifest: scan.manifest, model: scan.model, isPlaceholder: false } : null;
}

function useSceneSourcePublisher(loaded: LoadedScene | null, scan: LoadedScan | null): void {
  const setSceneSource = useSceneStore((state) => state.setSceneSource);
  useEffect(() => {
    const source: SceneSource | null = scan
      ? { kind: "scan", manifest: scan.manifest, model: scan.model, geom: scan.geom }
      : loaded
        ? { kind: "fixture", manifest: loaded.manifest, model: loaded.model, geom: NO_GEOM }
        : null;
    setSceneSource(source);
  }, [loaded, scan, setSceneSource]);
  useEffect(() => () => setSceneSource(null), [setSceneSource]);
}

function useDropZone(onFile: (file: File) => void) {
  const [dragging, setDragging] = useState(false);
  return {
    dragging,
    handlers: {
      onDragOver: (event: DragEvent<HTMLDivElement>) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      },
      onDragLeave: (event: DragEvent<HTMLDivElement>) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragging(false);
      },
      onDrop: (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) onFile(file);
      },
    },
  };
}

export function Scene({ fixture, debug, t }: SceneProps) {
  useSceneKeys();
  useDebugPreset(debug);
  useInitialTime(t, debug);
  const isRigDebug = debug === RIG_DEBUG;
  const [scanRequest, dropScan] = useScanRequest();
  const liveScan = useMemo(() => (scanRequest ? scanFailure(window.location.search) : null), [scanRequest]);
  const fixtureLoaded = useLoadedScene(isRigDebug || scanRequest ? undefined : fixture);
  const { scan, alignAt, frameKey } = useScanScene(isRigDebug || liveScan ? null : scanRequest);
  const loaded = useMemo(() => (scanRequest ? scanLoadedScene(scan) : fixtureLoaded), [scanRequest, scan, fixtureLoaded]);
  const gateScene = useMemo<GateScene | null>(() => (scan ? { manifest: scan.manifest, geom: scan.geom } : null), [scan]);
  const graphSource = useMemo(() => {
    if (isRigDebug || !fixture) return null;
    if (!scanRequest) return selectSource(window.location.search, fixture);
    return gateScene && !liveScan ? fixtureGraphSource(fixture, scenarioFromSearch(window.location.search), gateScene) : null;
  }, [isRigDebug, fixture, scanRequest, gateScene, liveScan]);
  useGraphSource(graphSource);
  useSceneSourcePublisher(loaded, scan);
  const failure = useSceneFailure(fixture, isRigDebug, graphSource !== null, { request: scanRequest, loaded: scan !== null });
  const aligning = useScanAlignStore((state) => state.aligning);
  const onAlignClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (event.faceIndex === undefined || event.faceIndex === null) return;
      event.stopPropagation();
      alignAt({
        object: event.object,
        faceIndex: event.faceIndex,
        point: [event.point.x, event.point.y, event.point.z],
        direction: [event.ray.direction.x, event.ray.direction.y, event.ray.direction.z],
      });
    },
    [alignAt],
  );
  const drop = useDropZone(dropScan);
  const hasGraph = useSceneStore((state) => state.resolved !== null);
  const actorsReady = useSceneStore((state) => state.actorsReady);
  const status = useSceneStore((state) => state.status);
  const initial = CAMERA_PRESETS[useSceneStore.getState().preset];

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%" }}
      data-scene-ready={status === "ready" ? "true" : status === "error" ? "error" : "false"}
      {...(isRigDebug ? {} : drop.handlers)}
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
            <primitive object={loaded.model} onClick={scan && aligning ? onAlignClick : undefined} />
            {scan ? <ScanCeilingCut scan={scan} /> : null}
            {scan ? <FrameObject object={scan.model} frameKey={frameKey} /> : null}
            {loaded.isPlaceholder && fixture === STORE_FIXTURE ? (
              <Dressing manifest={loaded.manifest} placeholder={loaded.model} />
            ) : null}
            <LandmarkMarkers landmarks={loaded.manifest.landmarks} />
            <LabelProjector landmarks={loaded.manifest.landmarks} occluders={loaded.model} />
            <FloorProbe interior={loaded.manifest.interior} />
            <WitnessView model={loaded.model} manifest={loaded.manifest} />
            <PovRayLine />
            {hasGraph ? <Actors manifest={loaded.manifest} /> : null}
            {hasGraph ? <Props manifest={loaded.manifest} /> : null}
            {hasGraph ? <AnchorGizmo manifest={loaded.manifest} /> : null}
            {shouldSignalReady({ hasGraph, actorsReady, failure }) ? <ReadySignal /> : null}
          </>
        ) : null}
      </Canvas>
      {loaded ? <LabelLayer landmarks={loaded.manifest.landmarks} /> : null}
      {isRigDebug ? <RigReportPanel /> : null}
      {scan ? <ScanPanel scan={scan} /> : null}
      {drop.dragging ? <ScanDropHint /> : null}
      <SceneErrorCard />
      <DebugOverlay />
      {import.meta.env.DEV && !isRigDebug ? <ShotButton /> : null}
    </div>
  );
}
