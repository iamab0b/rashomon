import { useEffect, type CSSProperties } from "react";
import type { LabelingAdapter } from "./adapter";
import { useProposalStore, type ScanInput, type SuggestDeps } from "./proposalStore";
import { renderCandidateViews } from "./render";
import { devTransport, NEEDS_DEV_SERVER } from "./transport";

const sectionStyle: CSSProperties = { marginTop: 12, paddingTop: 8, borderTop: "1px solid rgba(255, 255, 255, 0.15)" };
const rowStyle: CSSProperties = { display: "flex", gap: 4, alignItems: "center", marginTop: 6, flexWrap: "wrap" };
const fieldStyle: CSSProperties = { flex: 1, minWidth: 0, boxSizing: "border-box" };
const badgeStyle: CSSProperties = { minWidth: 28, fontWeight: 700, color: "#ffd24a" };

const transport = devTransport();
const defaultDeps: SuggestDeps | null = transport ? { transport, render: renderCandidateViews } : null;

export type SuggestLandmarksProps = {
  readonly scan: ScanInput | null;
  readonly adapter: LabelingAdapter | null;
  readonly deps?: SuggestDeps | null;
};

export function SuggestLandmarks({ scan, adapter, deps = defaultDeps }: SuggestLandmarksProps) {
  const store = useProposalStore();
  const running = store.status === "running";
  const ready = scan !== null && adapter !== null && deps !== null;
  const geom = scan?.geom ?? null;
  useEffect(() => {
    const { source, clear } = useProposalStore.getState();
    if (source !== null && source !== geom) clear();
  }, [geom]);

  return (
    <div style={sectionStyle} data-testid="suggest-landmarks">
      <div style={rowStyle}>
        {running ? (
          <>
            <button disabled>Suggesting…</button>
            <button onClick={store.cancel}>Cancel</button>
          </>
        ) : (
          <button disabled={!ready} onClick={() => scan && deps && void store.suggest(scan, deps)}>
            Suggest landmarks
          </button>
        )}
      </div>
      {deps === null ? <div style={{ marginTop: 4, color: "#9aa7bd" }}>{NEEDS_DEV_SERVER}</div> : null}
      {deps !== null && scan === null ? <div style={{ marginTop: 4, color: "#9aa7bd" }}>Load a scan to get suggestions.</div> : null}
      {store.error ? (
        <div role="alert" style={{ marginTop: 4, color: "#ff6b5e" }}>
          {store.error}
        </div>
      ) : null}
      {store.proposals.length > 0 ? (
        <div style={{ marginTop: 6, color: "#9aa7bd" }}>
          {store.proposals.length} proposals, not saved until confirmed{store.dropped > 0 ? ` · ${store.dropped} dropped` : ""}
        </div>
      ) : null}
      {store.proposals.map((proposal) => (
        <div key={proposal.candidate.id} style={rowStyle} data-testid="landmark-proposal">
          <span style={badgeStyle}>{proposal.number}</span>
          <input
            aria-label={`Label for proposal ${proposal.number}`}
            value={proposal.label}
            style={fieldStyle}
            onChange={(event) => store.rename(proposal.candidate.id, { label: event.currentTarget.value })}
          />
          <input
            aria-label={`Id for proposal ${proposal.number}`}
            value={proposal.id}
            style={fieldStyle}
            onChange={(event) => store.rename(proposal.candidate.id, { id: event.currentTarget.value })}
          />
          <span style={{ color: "#9aa7bd" }}>{Math.round(proposal.confidence * 100)}%</span>
          <button disabled={adapter === null} onClick={() => adapter && store.confirm(proposal.candidate.id, adapter)}>
            Confirm
          </button>
          <button onClick={() => store.remove(proposal.candidate.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
