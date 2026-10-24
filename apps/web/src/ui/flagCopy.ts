import type { Flag } from "../scene";

export type CheckBasis = "scene" | "statements" | "statement";

const BASIS: Record<Flag["check"], CheckBasis> = {
  sightline: "scene",
  reachability: "scene",
  time_distance: "scene",
  contradiction: "statements",
  unanchored: "statement",
  missing_time: "statement",
};

export const BASIS_LABELS: Record<CheckBasis, string> = {
  scene: "Based on current scene data",
  statements: "Based on recorded statements",
  statement: "Based on the recorded statement",
};

export function checkBasis(check: Flag["check"]): CheckBasis {
  return BASIS[check];
}

export function flagHeadline(flag: Pick<Flag, "check" | "evidence">, placeName: (id: string) => string): string {
  switch (flag.check) {
    case "sightline": {
      const blocker = flag.evidence.blocker;
      return typeof blocker === "string"
        ? `Under the current scene geometry, the sightline is blocked by the ${placeName(blocker)}.`
        : "Under the current scene geometry, the sightline is blocked.";
    }
    case "reachability":
      return "No walkable path was found under the current scene data.";
    case "time_distance":
      return "Under the current scene data, the stated time looks too short to cover this distance.";
    case "contradiction":
      return "The recorded statements describe this actor differently during overlapping times.";
    case "unanchored":
      return "No location was recorded for this statement.";
    case "missing_time":
      return "No time was recorded for this statement.";
  }
}
