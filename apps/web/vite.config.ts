import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { shotPlugin } from "./scripts/shotPlugin";
import { uthanaPlugin } from "./scripts/uthanaPlugin";

export default defineConfig({
  plugins: [react(), shotPlugin(), uthanaPlugin()],
  optimizeDeps: { exclude: ["recast-navigation"] },
});
