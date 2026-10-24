const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

function fnv1a64(text: string): string {
  let hash = OFFSET;
  for (const byte of new TextEncoder().encode(text)) hash = ((hash ^ BigInt(byte)) * PRIME) & MASK;
  return hash.toString(16).padStart(16, "0");
}

export const MAX_STATEMENT_CHARS = 32_000;
export const MAX_STATEMENT_BYTES = 64 * 1024;
export const MAX_WITNESS_NAME_CHARS = 64;

export function statementSegmentId(sessionId: string, witnessName: string, text: string): string {
  return `seg_${fnv1a64(`${sessionId}\n${witnessName.trim()}\n${text.trim()}`)}`;
}

export function checkStatement(text: string, witnessName: string): string | null {
  if (text.trim() === "") return "statement text must not be empty";
  if (text.trim().length > MAX_STATEMENT_CHARS) return `statement text must be at most ${MAX_STATEMENT_CHARS} characters`;
  const bytes = new TextEncoder().encode(text.trim()).length;
  if (bytes > MAX_STATEMENT_BYTES)
    return `statement text must be at most ${MAX_STATEMENT_BYTES} bytes in UTF-8, and this one is ${bytes}`;
  const name = witnessName.trim();
  if (name.length < 1 || name.length > MAX_WITNESS_NAME_CHARS)
    return `witness name must be 1 to ${MAX_WITNESS_NAME_CHARS} characters`;
  return null;
}
