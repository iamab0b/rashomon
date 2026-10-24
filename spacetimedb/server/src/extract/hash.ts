const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

export function fnv1a64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let h = OFFSET;
  for (const b of bytes) h = ((h ^ BigInt(b)) * PRIME) & MASK;
  return h.toString(16).padStart(16, "0");
}
