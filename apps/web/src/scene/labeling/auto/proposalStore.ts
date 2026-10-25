import { generatePortals, type SceneGeom } from "@rashomon/engine";
import type { Interior, Portals } from "@rashomon/schema";
import type { Object3D } from "three";
import { boundsOf } from "../../loaders/alignment";
import { create } from "zustand";
import type { LabelingAdapter } from "./adapter";
import { findCandidates, type Candidate } from "./candidates";
import type { LandmarkPayload } from "./payload";
import { isProposalId, landmarkFromProposal, titleCase, type ProposalKind, type ProposalLabel } from "./tool";
import type { SuggestTransport } from "./transport";
import { SuggestError } from "./transport";

export type Proposal = {
  readonly candidate: Candidate;
  readonly number: number;
  readonly toolLabel: ProposalLabel;
  readonly kind: ProposalKind;
  readonly occludes: boolean;
  readonly confidence: number;
  readonly label: string;
  readonly id: string;
};

export type ScanInput = { readonly geom: SceneGeom; readonly model: Object3D };

export type RenderViews = (model: Object3D, candidates: readonly Candidate[], interior: Interior, y0: number) => string[] | Promise<string[]>;

export type SuggestDeps = { readonly transport: SuggestTransport; readonly render: RenderViews };

export type SuggestStatus = "idle" | "running" | "error";

export type ProposalState = {
  status: SuggestStatus;
  error: string | null;
  proposals: Proposal[];
  dropped: number;
  y0: number;
  source: SceneGeom | null;
  portals: Portals | null;
  controller: AbortController | null;
  suggest: (scan: ScanInput, deps: SuggestDeps) => Promise<void>;
  cancel: () => void;
  rename: (candidateId: string, change: { label?: string; id?: string }) => void;
  remove: (candidateId: string) => void;
  confirm: (candidateId: string, adapter: LabelingAdapter) => boolean;
  clear: () => void;
};

export const NO_CANDIDATES = "No objects found above the floor";
export const SUGGEST_FAILED = "The suggestion failed";
export const NO_SCAN_BOUNDS = "The scan has no geometry";

function numberOf(candidate: Candidate): number {
  return Number(candidate.id.slice(1));
}

function shortError(error: unknown): string {
  return error instanceof SuggestError ? error.message : SUGGEST_FAILED;
}

export const useProposalStore = create<ProposalState>((set, get) => ({
  status: "idle",
  error: null,
  proposals: [],
  dropped: 0,
  y0: 0,
  source: null,
  portals: null,
  controller: null,
  suggest: async (scan, deps) => {
    get().controller?.abort();
    const controller = new AbortController();
    set({ status: "running", error: null, controller });
    const finish = (patch: Partial<ProposalState>) => {
      if (get().controller === controller) set({ controller: null, ...patch });
    };
    try {
      const found = findCandidates(scan.geom);
      if (!found.ok) return finish({ status: "error", error: found.error });
      if (found.candidates.length === 0) return finish({ status: "error", error: NO_CANDIDATES });
      const interior = boundsOf(scan.geom.meshes.map((mesh) => mesh.positions));
      if (!interior) return finish({ status: "error", error: NO_SCAN_BOUNDS });
      const images = await deps.render(scan.model, found.candidates, interior, found.y0);
      if (controller.signal.aborted) return;
      const payload: LandmarkPayload = { images, candidates: found.candidates.map(({ id, size }) => ({ id, size })) };
      const result = await deps.transport(payload, controller.signal);
      if (controller.signal.aborted) return;
      const byId = new Map(found.candidates.map((candidate) => [candidate.id, candidate]));
      const proposals = result.proposals
        .map((proposal): Proposal => {
          const candidate = byId.get(proposal.candidate)!;
          return {
            candidate,
            number: numberOf(candidate),
            toolLabel: proposal.label,
            kind: proposal.kind,
            occludes: proposal.occludes,
            confidence: proposal.confidence,
            label: titleCase(proposal.label),
            id: proposal.id,
          };
        })
        .sort((a, b) => a.number - b.number);
      finish({ status: "idle", proposals, dropped: result.dropped, y0: found.y0, source: scan.geom });
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("landmark suggestion failed", error);
      finish({ status: "error", error: shortError(error) });
    }
  },
  cancel: () => {
    const { controller } = get();
    controller?.abort();
    set({ controller: null, status: "idle" });
  },
  rename: (candidateId, change) =>
    set((state) => ({
      proposals: state.proposals.map((proposal) =>
        proposal.candidate.id === candidateId
          ? { ...proposal, label: change.label ?? proposal.label, id: change.id ?? proposal.id }
          : proposal,
      ),
    })),
  remove: (candidateId) => set((state) => ({ proposals: state.proposals.filter((proposal) => proposal.candidate.id !== candidateId) })),
  confirm: (candidateId, adapter) => {
    const proposal = get().proposals.find((entry) => entry.candidate.id === candidateId);
    if (!proposal) return false;
    const label = proposal.label.trim();
    const id = proposal.id.trim();
    if (label === "" || !isProposalId(id)) {
      set({ error: `Proposal ${proposal.number} needs a label and a snake_case id` });
      return false;
    }
    adapter.addLandmark(
      landmarkFromProposal({ label: proposal.toolLabel, kind: proposal.kind, occludes: proposal.occludes, id }, proposal.candidate, label),
    );
    const manifest = adapter.confirmedManifest();
    set((state) => ({
      error: null,
      proposals: state.proposals.filter((entry) => entry.candidate.id !== candidateId),
      portals: manifest ? generatePortals(manifest) : null,
    }));
    return true;
  },
  clear: () => {
    get().controller?.abort();
    set({ status: "idle", error: null, proposals: [], dropped: 0, source: null, portals: null, controller: null });
  },
}));
