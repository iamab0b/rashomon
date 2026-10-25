import type { Landmark } from "@rashomon/schema";

export function landmarkErrors(landmarks: readonly Landmark[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const landmark of landmarks) {
    if (landmark.label.trim() === "") errors.push(`Landmark "${landmark.id}" needs a label`);
    if (landmark.id.trim() === "") errors.push(`Landmark "${landmark.label}" needs an id`);
    else if (seen.has(landmark.id)) errors.push(`Id "${landmark.id}" is used twice`);
    seen.add(landmark.id);
  }
  return errors;
}

type Keyed = { key: number; landmark: Landmark };

export function idErrorFor(entries: readonly Keyed[], key: number): string | null {
  const entry = entries.find((candidate) => candidate.key === key);
  if (!entry) return null;
  if (entry.landmark.id.trim() === "") return "Id is required";
  const clash = entries.some((other) => other.key !== key && other.landmark.id === entry.landmark.id);
  return clash ? "Id is already used" : null;
}

export function labelErrorFor(entries: readonly Keyed[], key: number): string | null {
  const entry = entries.find((candidate) => candidate.key === key);
  return entry && entry.landmark.label.trim() === "" ? "Label is required" : null;
}
