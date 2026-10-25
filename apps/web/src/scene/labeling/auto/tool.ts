import type { Landmark } from "@rashomon/schema";
import type { Candidate } from "./candidates";

export const TOOL_NAME = "propose_landmarks";
export const PROPOSAL_LABELS = ["counter", "shelf", "door", "window", "cooler", "table", "wall", "other"] as const;
export const PROPOSAL_KINDS = ["zone", "occluder"] as const;
export const MAX_PROPOSAL_ID_CHARS = 24;
export const PROPOSAL_ID_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
export const PROPOSAL_KEYS = ["candidate", "label", "kind", "occludes", "confidence", "id"] as const;

export type ProposalLabel = (typeof PROPOSAL_LABELS)[number];
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export type ToolProposal = {
  readonly candidate: string;
  readonly label: ProposalLabel;
  readonly kind: ProposalKind;
  readonly occludes: boolean;
  readonly confidence: number;
  readonly id: string;
};

export type ValidatedProposals = { readonly proposals: ToolProposal[]; readonly dropped: number };

export type ToolDefinition = {
  name: string;
  description: string;
  strict: boolean;
  input_schema: Record<string, unknown>;
};

export function proposeLandmarksTool(candidateIds: readonly string[]): ToolDefinition {
  return {
    name: TOOL_NAME,
    description: "Propose a name and kind for numbered candidate boxes that are visible in the images. Skip boxes you cannot see.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        proposals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              candidate: { type: "string", enum: [...candidateIds], description: "The candidate id drawn on the box, e.g. c3." },
              label: { type: "string", enum: [...PROPOSAL_LABELS], description: "What the box is. Use other when unsure." },
              kind: {
                type: "string",
                enum: [...PROPOSAL_KINDS],
                description: "zone for a floor area a person stands in or walks through; occluder for a solid object.",
              },
              occludes: { type: "boolean", description: "true if the object blocks a standing person's line of sight." },
              confidence: { type: "number", description: "How sure you are, from 0 to 1." },
              id: {
                type: "string",
                description: `A short snake_case id for the landmark, at most ${MAX_PROPOSAL_ID_CHARS} characters, e.g. front_counter.`,
              },
            },
            required: [...PROPOSAL_KEYS],
            additionalProperties: false,
          },
        },
      },
      required: ["proposals"],
      additionalProperties: false,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

export function isProposalId(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_PROPOSAL_ID_CHARS && PROPOSAL_ID_PATTERN.test(value);
}

function proposalOf(value: unknown, candidateIds: ReadonlySet<string>): ToolProposal | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== PROPOSAL_KEYS.length || !PROPOSAL_KEYS.every((key) => keys.includes(key))) return null;
  const { candidate, label, kind, occludes, confidence, id } = value;
  if (typeof candidate !== "string" || !candidateIds.has(candidate)) return null;
  if (!isOneOf(PROPOSAL_LABELS, label) || !isOneOf(PROPOSAL_KINDS, kind)) return null;
  if (typeof occludes !== "boolean") return null;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  if (!isProposalId(id)) return null;
  return { candidate, label, kind, occludes, confidence, id };
}

export function validateProposals(input: unknown, candidateIds: Iterable<string>): ValidatedProposals {
  const known = new Set(candidateIds);
  const list = isRecord(input) && Array.isArray(input.proposals) ? input.proposals : null;
  if (!list) return { proposals: [], dropped: 0 };
  const seen = new Set<string>();
  const proposals: ToolProposal[] = [];
  let dropped = 0;
  for (const value of list) {
    const proposal = proposalOf(value, known);
    if (!proposal || seen.has(proposal.candidate)) {
      dropped += 1;
      continue;
    }
    seen.add(proposal.candidate);
    proposals.push(proposal);
  }
  return { proposals, dropped };
}

export function landmarkKindFor(label: ProposalLabel, kind: ProposalKind): Landmark["kind"] {
  if (kind === "zone") return "zone";
  if (label === "door") return "door";
  if (label === "window") return "window";
  if (label === "cooler") return "appliance";
  return "furniture";
}

export function titleCase(text: string): string {
  return text
    .split(/[\s_]+/)
    .filter((word) => word !== "")
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

export function landmarkFromProposal(
  proposal: Pick<ToolProposal, "label" | "kind" | "occludes" | "id">,
  candidate: Pick<Candidate, "bounds" | "position">,
  label: string = titleCase(proposal.label),
): Landmark {
  return {
    id: proposal.id,
    label,
    aliases: [proposal.label],
    position: [...candidate.position],
    bounds: { min: [...candidate.bounds.min], max: [...candidate.bounds.max] },
    kind: landmarkKindFor(proposal.label, proposal.kind),
    occludes: proposal.occludes,
  };
}
