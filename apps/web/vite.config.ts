import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { shotPlugin } from "./scripts/shotPlugin";

export default defineConfig({
  plugins: [react(), shotPlugin()],
  optimizeDeps: { exclude: ["recast-navigation"] },
});
