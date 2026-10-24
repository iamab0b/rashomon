const FALLBACK = "landmark";

export function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug === "" ? FALLBACK : slug;
}

export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export function idForLabel(label: string, taken: Iterable<string>): string {
  return uniqueId(slugify(label), taken);
}

export function nextIdForLabel(currentId: string, oldLabel: string, newLabel: string, taken: Iterable<string>): string {
  if (newLabel.trim() === "") return currentId;
  const others = [...taken];
  if (currentId !== idForLabel(oldLabel, others)) return currentId;
  return idForLabel(newLabel, others);
}

export function parseAliases(text: string): string[] {
  return text
    .split(",")
    .map((alias) => alias.trim())
    .filter((alias) => alias !== "");
}
