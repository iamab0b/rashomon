export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_UTTERANCES = 50;
export const MAX_SEGMENT_TEXT_CHARS = 32_000;
export const MAX_WITNESS_NAME_CHARS = 64;

const encoder = new TextEncoder();

export const utf8Bytes = (text: string): number => encoder.encode(text).length;
