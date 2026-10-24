import { Canvas } from "@react-three/fiber";
import { Scene } from "./scene";

const PANEL_WIDTH_PX = 360;

export function App() {
  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <div style={{ flex: 1 }}>
        <Canvas camera={{ position: [4.5, 6, -4], fov: 50 }}>
          <Scene />
        </Canvas>
      </div>
      <div
        style={{
          width: PANEL_WIDTH_PX,
          borderLeft: "1px solid #222831",
          color: "#c9d1d9",
          padding: 16,
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}
