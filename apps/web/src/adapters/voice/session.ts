import { base64ToBytes, pcm16ToFloat, SAMPLE_RATE } from "./audio";
import { agentSocketUrl, audioInput, parseServerEvent, relaySocketUrl, sessionCreate } from "./events";
import { IDLE, voiceReducer, type VoiceAction, type VoiceState } from "./state";

export type SocketLike = {
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
};

export type Microphone = { stop(): void };

export type Player = { enqueue(samples: Float32Array, sampleRate: number): void; clear(): void; close(): void };

export type VoiceDeps = {
  agentId: string;
  relay?: boolean;
  fetchToken(): Promise<string>;
  openSocket(url: string): SocketLike;
  openMicrophone(onChunk: (pcm: Uint8Array) => void): Promise<Microphone>;
  openPlayer(onDrained: () => void): Player;
};

const OPEN = 1;
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export class VoiceSession {
  private state: VoiceState = IDLE;
  private socket: SocketLike | null = null;
  private mic: Microphone | null = null;
  private player: Player | null = null;
  private ready = false;
  private run = 0;

  constructor(
    private readonly deps: VoiceDeps,
    private readonly onState: (state: VoiceState) => void = () => {},
  ) {}

  get current(): VoiceState {
    return this.state;
  }

  private dispatch(action: VoiceAction): void {
    const next = voiceReducer(this.state, action);
    if (next === this.state) return;
    this.state = next;
    this.onState(next);
  }

  async start(): Promise<void> {
    if (this.state.status !== "idle" && this.state.status !== "error") return;
    this.release();
    const run = ++this.run;
    this.dispatch({ type: "start" });
    try {
      if (!this.deps.agentId) throw new Error("No Cartesia agent id; run pnpm --filter agent setup");
      const mic = await this.deps.openMicrophone((pcm) => this.sendAudio(run, pcm));
      if (run !== this.run) return mic.stop();
      this.mic = mic;
      const url = this.deps.relay
        ? relaySocketUrl(this.deps.agentId)
        : agentSocketUrl(this.deps.agentId, await this.deps.fetchToken());
      if (run !== this.run) return;
      this.player = this.deps.openPlayer(() => run === this.run && this.dispatch({ type: "drained" }));
      const socket = this.deps.openSocket(url);
      this.socket = socket;
      socket.onopen = () => socket.send(sessionCreate());
      socket.onmessage = (ev) => run === this.run && this.handle(ev.data);
      socket.onerror = () => run === this.run && this.fail("Voice connection error");
      socket.onclose = (ev) => run === this.run && this.fail(`Voice connection closed (${ev.code}${ev.reason ? `: ${ev.reason}` : ""})`);
    } catch (err) {
      if (run === this.run) this.fail(messageOf(err));
    }
  }

  stop(): void {
    this.run++;
    this.release();
    this.dispatch({ type: "stop" });
  }

  private sendAudio(run: number, pcm: Uint8Array): void {
    if (run !== this.run || !this.ready || this.socket?.readyState !== OPEN) return;
    this.socket.send(audioInput(pcm));
  }

  private handle(raw: unknown): void {
    const event = parseServerEvent(raw);
    if (!event) return;
    switch (event.type) {
      case "session_ready":
        this.ready = true;
        this.dispatch({ type: "ready" });
        return;
      case "audio_output":
        this.player?.enqueue(pcm16ToFloat(base64ToBytes(event.audio)), SAMPLE_RATE);
        this.dispatch({ type: "agentAudio" });
        return;
      case "audio_output_clear":
        this.interrupt();
        return;
      case "turn_started":
        if (event.role === "user") this.interrupt();
        return;
      case "error":
        if (event.fatal) this.fail(event.message);
        return;
    }
  }

  private interrupt(): void {
    this.player?.clear();
    this.dispatch({ type: "interrupted" });
  }

  private fail(error: string): void {
    this.run++;
    this.release();
    this.dispatch({ type: "fail", error });
  }

  private release(): void {
    this.ready = false;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      if (socket.readyState <= OPEN) socket.close(1000, "session completed");
    }
    this.mic?.stop();
    this.mic = null;
    this.player?.clear();
    this.player?.close();
    this.player = null;
  }
}
