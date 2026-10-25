import { Chunker } from "./audio";
import { PlaybackQueue, webAudioSink } from "./playback";
import type { Microphone, Player, SocketLike, VoiceDeps } from "./session";

declare const __CARTESIA_AGENT_ID__: string | undefined;

export const TOKEN_URL = "http://127.0.0.1:8787/token";

const CAPTURE_WORKLET = `registerProcessor("rashomon-capture", class extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
});`;

export async function fetchToken(url = TOKEN_URL, fetchImpl: typeof fetch = fetch): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "POST" });
  } catch {
    throw new Error("Token server not reachable; run pnpm --filter agent token-server");
  }
  if (!res.ok) throw new Error(`Token server returned ${res.status}`);
  const body = (await res.json()) as { token?: unknown };
  if (typeof body.token !== "string") throw new Error("Token server sent no token");
  return body.token;
}

export async function openMicrophone(onChunk: (pcm: Uint8Array) => void): Promise<Microphone> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser has no microphone access");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext();
  try {
    const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "application/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "rashomon-capture");
    const chunker = new Chunker(ctx.sampleRate);
    node.port.onmessage = (ev: MessageEvent<Float32Array>) => {
      for (const chunk of chunker.push(ev.data)) onChunk(chunk);
    };
    source.connect(node);
    return {
      stop() {
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        for (const track of stream.getTracks()) track.stop();
        void ctx.close();
      },
    };
  } catch (err) {
    for (const track of stream.getTracks()) track.stop();
    void ctx.close();
    throw err;
  }
}

export function openPlayer(onDrained: () => void): Player {
  const ctx = new AudioContext();
  void ctx.resume();
  const queue = new PlaybackQueue(webAudioSink(ctx), onDrained);
  return {
    enqueue: (samples, rate) => queue.enqueue(samples, rate),
    clear: () => queue.clear(),
    close: () => void ctx.close(),
  };
}

export function browserVoiceDeps(): VoiceDeps {
  return {
    agentId: typeof __CARTESIA_AGENT_ID__ === "string" ? __CARTESIA_AGENT_ID__ : "",
    fetchToken: () => fetchToken(),
    openSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    openMicrophone,
    openPlayer,
  };
}
