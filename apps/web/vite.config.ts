import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { landmarkPlugin } from "./scripts/landmarkPlugin";
import { shotPlugin } from "./scripts/shotPlugin";

const cartesiaIds = new URL("../agent/.cartesia-ids.json", import.meta.url);
const agentId: string = process.env.CARTESIA_AGENT_ID?.trim() || (existsSync(cartesiaIds) ? (JSON.parse(readFileSync(cartesiaIds, "utf8")).agentId ?? "") : "");

export default defineConfig({
  plugins: [react(), shotPlugin(), landmarkPlugin()],
  optimizeDeps: { exclude: ["recast-navigation"] },
  define: { __CARTESIA_AGENT_ID__: JSON.stringify(agentId) },
});
