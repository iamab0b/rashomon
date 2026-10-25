export const SAMPLE_RATE = 16000;
export const INPUT_FORMAT = "pcm_16000";

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function floatToPcm16(samples: Float32Array): Uint8Array {
  const out = new DataView(new ArrayBuffer(samples.length * 2));
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    out.setInt16(i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
  }
  return new Uint8Array(out.buffer);
}

export function pcm16ToFloat(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}

export class Resampler {
  private pending: number[] = [];
  private position = 0;
  private readonly step: number;

  constructor(fromRate: number, toRate = SAMPLE_RATE) {
    this.step = fromRate / toRate;
  }

  push(input: Float32Array): Float32Array {
    for (const s of input) this.pending.push(s);
    const out: number[] = [];
    while (this.position + 1 < this.pending.length) {
      const i = Math.floor(this.position);
      const frac = this.position - i;
      out.push(this.pending[i]! * (1 - frac) + this.pending[i + 1]! * frac);
      this.position += this.step;
    }
    const used = Math.min(Math.floor(this.position), this.pending.length);
    this.pending = this.pending.slice(used);
    this.position -= used;
    return Float32Array.from(out);
  }
}

export class Chunker {
  private buffer: number[] = [];
  private readonly resampler: Resampler;
  private readonly size: number;

  constructor(fromRate: number, chunkMs = 40) {
    this.resampler = new Resampler(fromRate);
    this.size = Math.round((SAMPLE_RATE * chunkMs) / 1000);
  }

  push(input: Float32Array): Uint8Array[] {
    for (const s of this.resampler.push(input)) this.buffer.push(s);
    const chunks: Uint8Array[] = [];
    while (this.buffer.length >= this.size) chunks.push(floatToPcm16(Float32Array.from(this.buffer.splice(0, this.size))));
    return chunks;
  }
}
