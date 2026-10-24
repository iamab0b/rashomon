export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_UTTERANCES = 50;

const encoder = new TextEncoder();

export const byteLength = (value: unknown): number => encoder.encode(JSON.stringify(value)).length;
