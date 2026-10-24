import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "@playwright/test";

const VIEWPORT = { width: 1600, height: 900 };
const READY_TIMEOUT_MS = 30_000;
const SETTLE_MS = 500;
const HIDE_SHOT_CONTROLS = "[data-shot-control]{display:none !important}";

export type CaptureShotOptions = {
  readonly baseUrl: string;
  readonly query: string;
  readonly outFile: string;
};

export type CaptureShot = (options: CaptureShotOptions) => Promise<void>;

export const captureShot: CaptureShot = async ({ baseUrl, query, outFile }) => {
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
    await page.goto(new URL(`?${query}`, baseUrl).toString());
    await page.waitForSelector('[data-scene-ready="true"], [data-scene-ready="error"]', {
      timeout: READY_TIMEOUT_MS,
    });
    const state = await page.getAttribute("[data-scene-ready]", "data-scene-ready");
    if (state === "error") throw new Error("scene reported a load error (data-scene-ready=error)");
    await page.waitForTimeout(SETTLE_MS);
    await page.addStyleTag({ content: HIDE_SHOT_CONTROLS });
    await mkdir(dirname(outFile), { recursive: true });
    await page.screenshot({ path: outFile });
  } finally {
    await browser.close();
  }
};
