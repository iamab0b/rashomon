import { resolve } from "node:path";
import { createServer } from "vite";
import { captureShot } from "./shotCapture";

function readArgs(argv: readonly string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag?.startsWith("--") && value !== undefined && !value.startsWith("--")) {
      args.set(flag.slice(2), value);
      i += 1;
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = readArgs(process.argv.slice(2));
  const debug = args.get("debug");
  const cam = args.get("cam") ?? (debug ? undefined : "overview");
  const query = new URLSearchParams();
  if (debug) query.set("debug", debug);
  else query.set("fixture", args.get("fixture") ?? "store");
  if (cam) query.set("cam", cam);
  const t = args.get("t");
  if (t !== undefined) query.set("t", t);
  const scenario = args.get("scenario");
  if (scenario !== undefined) query.set("scenario", scenario);
  const outDir = resolve(process.cwd(), "shots");
  const defaultName = debug ? `debug-${debug}.png` : `${cam}.png`;
  const outFile = resolve(outDir, args.get("out") ?? defaultName);

  const server = await createServer({ server: { port: 0 }, logLevel: "error" });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("dev server has no port");

  try {
    await captureShot({ baseUrl: `http://localhost:${address.port}/`, query: query.toString(), outFile });
    process.stdout.write(`wrote ${outFile}\n`);
  } finally {
    await server.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
