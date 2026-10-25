export type Voice = { stop(): void };

export type Sink = {
  now(): number;
  play(samples: Float32Array, sampleRate: number, at: number, onEnded: () => void): Voice;
};

export class PlaybackQueue {
  private playing = new Set<Voice>();
  private nextAt = 0;

  constructor(
    private readonly sink: Sink,
    private readonly onDrained: () => void = () => {},
  ) {}

  get size(): number {
    return this.playing.size;
  }

  enqueue(samples: Float32Array, sampleRate: number): void {
    if (samples.length === 0) return;
    const at = Math.max(this.sink.now(), this.nextAt);
    this.nextAt = at + samples.length / sampleRate;
    const voice: Voice = this.sink.play(samples, sampleRate, at, () => {
      if (!this.playing.delete(voice)) return;
      if (this.playing.size === 0) this.onDrained();
    });
    this.playing.add(voice);
  }

  clear(): void {
    const voices = [...this.playing];
    this.playing.clear();
    this.nextAt = 0;
    for (const v of voices) v.stop();
  }
}

export function webAudioSink(ctx: AudioContext): Sink {
  return {
    now: () => ctx.currentTime,
    play(samples, sampleRate, at, onEnded) {
      const buffer = ctx.createBuffer(1, samples.length, sampleRate);
      buffer.copyToChannel(Float32Array.from(samples), 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = onEnded;
      source.start(at);
      return {
        stop() {
          source.onended = null;
          try {
            source.stop();
          } catch {}
          source.disconnect();
        },
      };
    },
  };
}
