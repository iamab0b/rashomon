import type { SceneManifest } from "@rashomon/schema";
import scanDemo from "./scan_demo.json";

export function seedManifest(): SceneManifest {
  return structuredClone(scanDemo) as SceneManifest;
}
