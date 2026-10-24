import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type {
  EventGraph,
  Patch,
  PropType,
  SceneManifest,
  Segment,
} from "@rashomon/schema";
import { createAnthropicCaller } from "./anthropic";
import { compareToFixture } from "./compare";
import { extractSegment } from "./extract";
import { applyPatchesLocal } from "./localGraph";
import { EXTRACTION_MODEL } from "./prompt";
import type { ExtractContext } from "./types";

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v ?? fallback;
};

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set. Put it in .env.local at the repo root.");
    process.exit(1);
  }
  const transcriptPath = arg("transcript", "fixtures/robbery.transcript.json");
  const outDir = arg("out", "out");
  const model = arg("model", EXTRACTION_MODEL);

  const manifest = readJson<SceneManifest>("../schema/fixtures/store.scene.json");
  const propTypes = readJson<PropType[]>("../props/props.json");
  const expected = readJson<EventGraph>("../schema/fixtures/robbery.graph.json");
  const segments = transcriptPath
    .split(",")
    .flatMap((path) => readJson<Segment[]>(path.trim()));

  let graph: EventGraph = {
    sceneId: manifest.sceneId,
    actors: expected.actors,
    events: [],
    props: [],
    version: 0,
  };
  const history: Segment[] = [];
  const log: { segmentId: string; patches: Patch[]; unparsed: string[] }[] = [];
  const caller = createAnthropicCaller(apiKey);

  for (const segment of segments) {
    history.push(segment);
    const ctx: ExtractContext = {
      landmarks: manifest.landmarks,
      actors: graph.actors,
      propTypes,
      events: graph.events,
      props: graph.props,
      recentSegments: history,
    };
    const result = await extractSegment(segment, ctx, caller, { model });
    graph = applyPatchesLocal(graph, result.patches);
    log.push({
      segmentId: segment.id,
      patches: result.patches,
      unparsed: result.unparsed,
    });
    console.log(
      `${segment.id}: ${result.skipped ? "skipped" : `${result.patches.length} patches`}${result.unparsed.length ? `, ${result.unparsed.length} unparsed` : ""}`,
    );
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/patches.json`, JSON.stringify(log, null, 2));
  writeFileSync(`${outDir}/graph.json`, JSON.stringify(graph, null, 2));

  const score = compareToFixture(graph, expected);
  console.log(`\nmatched ${score.matched}/${score.total} fixture events`);
  if (score.missing.length) console.log("missing:\n  " + score.missing.join("\n  "));
  if (score.extras.length) console.log("extra:\n  " + score.extras.join("\n  "));
  console.log(`\nwrote ${outDir}/patches.json and ${outDir}/graph.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
