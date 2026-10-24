import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const VIEWPORT = { width: 1600, height: 900 };
const READY_TIMEOUT_MS = 30_000;
const SETTLE_MS = 500;

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
  const outDir = resolve(process.cwd(), "shots");
  const defaultName = debug ? `debug-${debug}.png` : `${cam}.png`;
  const outFile = resolve(outDir, args.get("out") ?? defaultName);

  const server = await createServer({ server: { port: 0 }, logLevel: "error" });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("dev server has no port");

  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    page.on("console", (message) => {
      if (["error", "warning", "info"].includes(message.type())) {
        process.stderr.write(`[page ${message.type()}] ${message.text()}\n`);
      }
    });
    page.on("pageerror", (error) => process.stderr.write(`[pageerror] ${error.message}\n`));
    await page.goto(`http://localhost:${address.port}/?${query.toString()}`);
    await page.waitForSelector('[data-scene-ready="true"]', { timeout: READY_TIMEOUT_MS });
    await page.waitForTimeout(SETTLE_MS);
    await mkdir(outDir, { recursive: true });
    await page.screenshot({ path: outFile });
    process.stdout.write(`wrote ${outFile}\n`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
