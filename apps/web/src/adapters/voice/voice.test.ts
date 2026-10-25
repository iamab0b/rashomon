import { describe, expect, test, vi } from "vitest";
import { base64ToBytes, bytesToBase64, Chunker, floatToPcm16, pcm16ToFloat, Resampler } from "./audio";
import { fetchToken } from "./browser";
import { agentSocketUrl, audioInput, parseServerEvent, sessionCreate } from "./events";
import { PlaybackQueue, type Sink } from "./playback";
import { VoiceSession, type Player, type SocketLike, type VoiceDeps } from "./session";
import { IDLE, voiceReducer, type VoiceState } from "./state";

describe("audio encoding", () => {
  test("float samples become little-endian 16-bit PCM and back", () => {
    const pcm = floatToPcm16(Float32Array.from([0, 1, -1, 0.5, 2, -2]));
    expect(Array.from(pcm.subarray(0, 6))).toEqual([0x00, 0x00, 0xff, 0x7f, 0x00, 0x80]);
    const view = new DataView(pcm.buffer);
    expect(view.getInt16(6, true)).toBe(Math.round(0.5 * 0x7fff));
    expect(view.getInt16(8, true)).toBe(0x7fff);
    expect(view.getInt16(10, true)).toBe(-0x8000);
    const back = pcm16ToFloat(pcm);
    expect(back[1]).toBeCloseTo(1, 3);
    expect(back[2]).toBe(-1);
  });

  test("base64 round-trips binary bytes, including large buffers", () => {
    const bytes = Uint8Array.from({ length: 70000 }, (_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    expect(bytesToBase64(Uint8Array.from([0, 255, 16]))).toBe("AP8Q");
  });

  test("the resampler turns 48 kHz into 16 kHz across pushes", () => {
    const r = new Resampler(48000, 16000);
    const ramp = Float32Array.from({ length: 4800 }, (_, i) => i / 4800);
    const out = [...r.push(ramp.subarray(0, 2000)), ...r.push(ramp.subarray(2000))];
    expect(out.length).toBeGreaterThanOrEqual(1599);
    expect(out.length).toBeLessThanOrEqual(1600);
    for (let i = 1; i < out.length; i++) expect(out[i]! - out[i - 1]!).toBeCloseTo(3 / 4800, 6);
  });

  test("the chunker emits 40 ms chunks of 16 kHz PCM", () => {
    const c = new Chunker(16000, 40);
    expect(c.push(new Float32Array(500))).toHaveLength(0);
    const chunks = c.push(new Float32Array(900));
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.byteLength).toBe(640 * 2);
  });
});

describe("events", () => {
  test("the socket URL carries the version and the browser access token", () => {
    const url = new URL(agentSocketUrl("agent_1", "tok/+="));
    expect(url.origin + url.pathname).toBe("wss://api.cartesia.ai/v1/agents/websocket/agent_1");
    expect(url.searchParams.get("cartesia_version")).toBe("2026-08-14");
    expect(url.searchParams.get("access_token")).toBe("tok/+=");
  });

  test("session_create declares 16 kHz PCM and audio_input carries base64", () => {
    expect(JSON.parse(sessionCreate())).toEqual({
      type: "session_create",
      audio: { input_format: "pcm_16000", output_delivery: "speaking_pace", continuous_input: true },
    });
    expect(JSON.parse(audioInput(Uint8Array.from([0, 255, 16])))).toEqual({ type: "audio_input", audio: "AP8Q" });
  });

  test("the parser accepts the documented server events and drops the rest", () => {
    expect(parseServerEvent(JSON.stringify({ type: "session_ready", call_id: "ac_1", agent_id: "a" }))).toEqual({ type: "session_ready", call_id: "ac_1" });
    expect(parseServerEvent(JSON.stringify({ type: "audio_output", audio: "AAA=" }))).toEqual({ type: "audio_output", audio: "AAA=" });
    expect(parseServerEvent(JSON.stringify({ type: "audio_output_clear" }))).toEqual({ type: "audio_output_clear" });
    expect(parseServerEvent(JSON.stringify({ type: "turn_started", turn: 3, role: "user", start_time: 1 }))).toEqual({ type: "turn_started", turn: 3, role: "user" });
    expect(parseServerEvent(JSON.stringify({ type: "error", code: "agent_failed", message: "boom", fatal: true }))).toEqual({
      type: "error",
      code: "agent_failed",
      message: "boom",
      fatal: true,
    });
    expect(parseServerEvent(JSON.stringify({ type: "audio_output" }))).toBeNull();
    expect(parseServerEvent(JSON.stringify({ type: "turn_ended", turn: 1 }))).toBeNull();
    expect(parseServerEvent("not json")).toBeNull();
    expect(parseServerEvent(JSON.stringify([1]))).toBeNull();
    expect(parseServerEvent(new ArrayBuffer(2))).toBeNull();
  });
});

describe("state transitions", () => {
  const run = (...actions: Parameters<typeof voiceReducer>[1][]) => actions.reduce<VoiceState>(voiceReducer, IDLE);

  test("idle -> connecting -> listening -> speaking -> listening", () => {
    expect(run({ type: "start" }).status).toBe("connecting");
    expect(run({ type: "start" }, { type: "ready" }).status).toBe("listening");
    expect(run({ type: "start" }, { type: "ready" }, { type: "agentAudio" }).status).toBe("speaking");
    expect(run({ type: "start" }, { type: "ready" }, { type: "agentAudio" }, { type: "interrupted" }).status).toBe("listening");
    expect(run({ type: "start" }, { type: "ready" }, { type: "agentAudio" }, { type: "drained" }).status).toBe("listening");
  });

  test("errors keep their message, can be retried, and stop always returns to idle", () => {
    const failed = run({ type: "start" }, { type: "fail", error: "nope" });
    expect(failed).toEqual({ status: "error", error: "nope" });
    expect(voiceReducer(failed, { type: "start" })).toEqual({ status: "connecting", error: null });
    expect(voiceReducer(failed, { type: "stop" })).toEqual(IDLE);
    expect(run({ type: "fail", error: "x" })).toEqual(IDLE);
    expect(run({ type: "agentAudio" })).toEqual(IDLE);
    expect(run({ type: "ready" })).toEqual(IDLE);
  });
});

function fakeSink() {
  let time = 0;
  const voices: { at: number; length: number; stopped: boolean; end: () => void }[] = [];
  const sink: Sink = {
    now: () => time,
    play(samples, _rate, at, onEnded) {
      const v = { at, length: samples.length, stopped: false, end: onEnded };
      voices.push(v);
      return { stop: () => void (v.stopped = true) };
    },
  };
  return { sink, voices, setTime: (t: number) => void (time = t) };
}

describe("playback queue", () => {
  test("chunks are scheduled back to back", () => {
    const { sink, voices } = fakeSink();
    const q = new PlaybackQueue(sink);
    q.enqueue(new Float32Array(1600), 16000);
    q.enqueue(new Float32Array(800), 16000);
    expect(voices.map((v) => v.at)).toEqual([0, 0.1]);
  });

  test("clearing on interruption stops every queued chunk and restarts the clock", () => {
    const { sink, voices, setTime } = fakeSink();
    const drained = vi.fn();
    const q = new PlaybackQueue(sink, drained);
    for (let i = 0; i < 3; i++) q.enqueue(new Float32Array(1600), 16000);
    q.clear();
    expect(voices.every((v) => v.stopped)).toBe(true);
    expect(q.size).toBe(0);
    voices[0]!.end();
    expect(drained).not.toHaveBeenCalled();
    setTime(0.05);
    q.enqueue(new Float32Array(160), 16000);
    expect(voices[3]!.at).toBe(0.05);
  });

  test("drained fires once the last chunk ends", () => {
    const { sink, voices } = fakeSink();
    const drained = vi.fn();
    const q = new PlaybackQueue(sink, drained);
    q.enqueue(new Float32Array(160), 16000);
    q.enqueue(new Float32Array(160), 16000);
    voices[0]!.end();
    expect(drained).not.toHaveBeenCalled();
    voices[1]!.end();
    expect(drained).toHaveBeenCalledTimes(1);
  });
});

class MockSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onerror: SocketLike["onerror"] = null;
  onclose: SocketLike["onclose"] = null;
  constructor(readonly url: string) {}
  send(data: string) {
    if (this.readyState !== 1) throw new Error("not open");
    this.sent.push(data);
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason };
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(event: unknown) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

function harness(overrides: Partial<VoiceDeps> = {}) {
  const sockets: MockSocket[] = [];
  const mic = { stop: vi.fn(), push: (_: Uint8Array) => {} };
  const player = { enqueue: vi.fn(), clear: vi.fn(), close: vi.fn(), drained: () => {} };
  const states: string[] = [];
  const deps: VoiceDeps = {
    agentId: "agent_1",
    fetchToken: vi.fn(async () => "tok_1"),
    openSocket: (url) => {
      const s = new MockSocket(url);
      sockets.push(s);
      return s;
    },
    openMicrophone: async (onChunk) => {
      mic.push = onChunk;
      return mic;
    },
    openPlayer: (onDrained): Player => {
      player.drained = onDrained;
      return player;
    },
    ...overrides,
  };
  const session = new VoiceSession(deps, (s) => states.push(s.status));
  return { session, sockets, mic, player, states, deps };
}

describe("voice session", () => {
  test("sends session_create first and holds audio until session_ready", async () => {
    const h = harness();
    await h.session.start();
    const ws = h.sockets[0]!;
    expect(ws.url).toContain("access_token=tok_1");
    h.mic.push(Uint8Array.from([1, 2]));
    ws.open();
    h.mic.push(Uint8Array.from([1, 2]));
    expect(ws.sent.map((m) => JSON.parse(m).type)).toEqual(["session_create"]);
    ws.receive({ type: "session_ready", call_id: "ac_1" });
    h.mic.push(Uint8Array.from([1, 2]));
    expect(JSON.parse(ws.sent[1]!)).toEqual({ type: "audio_input", audio: "AQI=" });
    expect(h.states).toEqual(["connecting", "listening"]);
  });

  test("agent audio plays, and barge-in clears the queue immediately", async () => {
    const h = harness();
    await h.session.start();
    const ws = h.sockets[0]!;
    ws.open();
    ws.receive({ type: "session_ready", call_id: "ac_1" });
    ws.receive({ type: "audio_output", audio: bytesToBase64(floatToPcm16(new Float32Array(160))) });
    expect(h.player.enqueue).toHaveBeenCalledWith(expect.any(Float32Array), 16000);
    expect(h.session.current.status).toBe("speaking");
    ws.receive({ type: "audio_output_clear" });
    expect(h.player.clear).toHaveBeenCalledTimes(1);
    expect(h.session.current.status).toBe("listening");
    ws.receive({ type: "audio_output", audio: "AAA=" });
    ws.receive({ type: "turn_started", turn: 4, role: "user", start_time: 2 });
    expect(h.player.clear).toHaveBeenCalledTimes(2);
    expect(h.session.current.status).toBe("listening");
    ws.receive({ type: "audio_output", audio: "AAA=" });
    h.player.drained();
    expect(h.session.current.status).toBe("listening");
  });

  test("stop closes the socket and releases the microphone", async () => {
    const h = harness();
    await h.session.start();
    const ws = h.sockets[0]!;
    ws.open();
    ws.receive({ type: "session_ready", call_id: "ac_1" });
    h.session.stop();
    expect(ws.closed).toEqual({ code: 1000, reason: "session completed" });
    expect(h.mic.stop).toHaveBeenCalledTimes(1);
    expect(h.player.close).toHaveBeenCalledTimes(1);
    expect(h.session.current).toEqual(IDLE);
    h.mic.push(Uint8Array.from([1]));
    expect(ws.sent).toHaveLength(1);
  });

  test("a fatal error event or an unexpected close ends in error and releases everything", async () => {
    const h = harness();
    await h.session.start();
    h.sockets[0]!.open();
    h.sockets[0]!.receive({ type: "error", code: "invalid_event", message: "minor", fatal: false });
    expect(h.session.current.status).toBe("connecting");
    h.sockets[0]!.receive({ type: "error", code: "agent_failed", message: "agent failed", fatal: true });
    expect(h.session.current).toEqual({ status: "error", error: "agent failed" });
    expect(h.mic.stop).toHaveBeenCalled();

    const g = harness();
    await g.session.start();
    g.sockets[0]!.open();
    g.sockets[0]!.onclose?.({ code: 1011, reason: "" });
    expect(g.session.current).toEqual({ status: "error", error: "Voice connection closed (1011)" });
    expect(g.mic.stop).toHaveBeenCalled();
  });

  test("a token failure is an error and the microphone is released", async () => {
    const h = harness({ fetchToken: async () => Promise.reject(new Error("Token server returned 502")) });
    await h.session.start();
    expect(h.session.current).toEqual({ status: "error", error: "Token server returned 502" });
    expect(h.mic.stop).toHaveBeenCalled();
    expect(h.sockets).toHaveLength(0);
  });

  test("stop during connect wins over a late token", async () => {
    let resolve: (t: string) => void = () => {};
    const h = harness({ fetchToken: () => new Promise<string>((r) => (resolve = r)) });
    const started = h.session.start();
    await Promise.resolve();
    await Promise.resolve();
    h.session.stop();
    resolve("tok_late");
    await started;
    expect(h.sockets).toHaveLength(0);
    expect(h.session.current).toEqual(IDLE);
  });

  test("a missing agent id fails before touching the microphone", async () => {
    const open = vi.fn();
    const h = harness({ agentId: "", openMicrophone: open });
    await h.session.start();
    expect(h.session.current.status).toBe("error");
    expect(open).not.toHaveBeenCalled();
  });
});

describe("token fetch", () => {
  test("posts to the local server and returns the token", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ token: "t" })));
    expect(await fetchToken("http://127.0.0.1:1/token", f as unknown as typeof fetch)).toBe("t");
    expect(f).toHaveBeenCalledWith("http://127.0.0.1:1/token", { method: "POST" });
  });

  test("explains when the token server is down", async () => {
    const f = vi.fn(async () => Promise.reject(new TypeError("Failed to fetch")));
    await expect(fetchToken("http://127.0.0.1:1/token", f as unknown as typeof fetch)).rejects.toThrow(/token-server/);
  });
});
