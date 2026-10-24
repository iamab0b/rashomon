import { isCameraPreset, POV_CAM } from "../src/scene/cameras/presets";

export type ShotRequest = {
  readonly fixture: string;
  readonly scenario: string | null;
  readonly cam: string;
  readonly t: number;
};

export type ShotRequestResult =
  | { readonly ok: true; readonly value: ShotRequest }
  | { readonly ok: false; readonly error: string };

const NAME_PATTERN = /^[a-z0-9_-]{1,32}$/;
const ALLOWED_KEYS: ReadonlySet<string> = new Set(["fixture", "scenario", "cam", "t", "mode"]);
const DEFAULT_FIXTURE = "store";
const DEFAULT_CAM = "overview";
const MAX_T_SECONDS = 600;
const T_STEPS_PER_SECOND = 10;

function fail(error: string): ShotRequestResult {
  return { ok: false, error };
}

function isPlainObject(body: unknown): body is Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

function parseName(value: unknown, field: string): { name: string } | { error: string } {
  if (typeof value !== "string" || !NAME_PATTERN.test(value)) {
    return { error: `${field} must match ${NAME_PATTERN.source}` };
  }
  return { name: value };
}

function parseT(value: unknown): { t: number } | { error: string } {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_T_SECONDS) {
    return { error: `t must be a finite number from 0 to ${MAX_T_SECONDS}` };
  }
  return { t: Math.round(value * T_STEPS_PER_SECOND) / T_STEPS_PER_SECOND };
}

export function parseShotRequest(body: unknown): ShotRequestResult {
  if (!isPlainObject(body)) return fail("body must be a JSON object");
  const unknownKey = Object.keys(body).find((key) => !ALLOWED_KEYS.has(key));
  if (unknownKey) return fail(`unknown field ${unknownKey}`);
  if (body.mode === "live") return fail("shots of live data are not supported: they depend on the server state at capture time");
  if (body.mode !== undefined && body.mode !== "fixture") return fail('mode must be "fixture" when given');

  const fixture = body.fixture === undefined ? { name: DEFAULT_FIXTURE } : parseName(body.fixture, "fixture");
  if ("error" in fixture) return fail(fixture.error);
  const scenario = body.scenario === undefined ? { name: null } : parseName(body.scenario, "scenario");
  if ("error" in scenario) return fail(scenario.error);
  const cam = body.cam === undefined ? DEFAULT_CAM : body.cam;
  if (typeof cam !== "string" || !(isCameraPreset(cam) || cam === POV_CAM)) {
    return fail(`cam must be a camera preset or "${POV_CAM}"`);
  }
  const t = body.t === undefined ? { t: 0 } : parseT(body.t);
  if ("error" in t) return fail(t.error);

  return { ok: true, value: { fixture: fixture.name, scenario: scenario.name, cam, t: t.t } };
}

export function shotFileName(request: ShotRequest): string {
  const scenario = request.scenario ? `-${request.scenario}` : "";
  return `${request.cam}-t${request.t}${scenario}.png`;
}

export function shotQuery(request: ShotRequest): string {
  const query = new URLSearchParams();
  query.set("fixture", request.fixture);
  query.set("cam", request.cam);
  query.set("t", String(request.t));
  if (request.scenario) query.set("scenario", request.scenario);
  return query.toString();
}
