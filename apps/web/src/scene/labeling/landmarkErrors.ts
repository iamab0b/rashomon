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
