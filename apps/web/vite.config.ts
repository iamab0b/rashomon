import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { landmarkPlugin } from "./scripts/landmarkPlugin";
import { shotPlugin } from "./scripts/shotPlugin";

export default defineConfig({
  plugins: [react(), shotPlugin(), landmarkPlugin()],
  optimizeDeps: { exclude: ["recast-navigation"] },
});
