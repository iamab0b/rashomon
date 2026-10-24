import type { ResolvedEvent, ResolvedGraph, Status } from "../scene";
import { BASIS_LABELS, checkBasis, flagHeadline } from "./flagCopy";
import { overrideTrail } from "./history";
import { placeName } from "./places";
import { formatEvidence, SourceRefs, StatusToken, words } from "./shared";

export const MISSING_OVERRIDE_RECORD =
  "This event is marked overridden, but it carries no override record (investigator, reason, recorded flags), so its earlier finding cannot be shown.";

export function OverrideHistory({
  graph,
  event,
  status,
  openSource,
}: {
  graph: ResolvedGraph;
  event: ResolvedEvent;
  status: Status;
  openSource: (sourceId: string) => void;
}) {
  const trail = overrideTrail(event);
  const override = event.override;

  if (!trail || !override) {
    return (
      <div className="override-trail">
        <p className="override-trail__missing" role="note">
          {MISSING_OVERRIDE_RECORD}
        </p>
      </div>
    );
  }

  return (
    <ol className="override-trail" aria-label="Override history">
      <li className="override-step override-step--original">
        <div className="override-step__head">
          <span className="override-step__label">Original finding</span>
          {trail.previousStatus ? <StatusToken status="implausible" /> : <span className="version-note">Status not recorded</span>}
        </div>
        {trail.recorded.map((flag) => (
          <div className="override-step__flag" key={flag.id}>
            <div className="flag-chips">
              <span className="check-chip">{words(flag.check)}</span>
              <span className={`severity-chip${flag.severity === "soft" ? " soft" : ""}`}>{flag.severity}</span>
            </div>
            <p>{flagHeadline(flag, (id) => placeName(graph.sceneId, id))}</p>
            <small>{BASIS_LABELS[checkBasis(flag.check)]}</small>
            {flag.detail && <p className="override-step__detail">{flag.detail}</p>}
            {Object.keys(flag.evidence).length > 0 && <div className="flag-evidence mono">{formatEvidence(flag)}</div>}
          </div>
        ))}
        {trail.missingFlagIds.map((id) => (
          <p className="override-trail__missing" key={id}>
            Flag <code>{id}</code> was recorded with the override, but the gate no longer reports it, so its explanation
            and evidence are not available.
          </p>
        ))}
        <div className="version-meta">
          <span>Statement</span>
          <SourceRefs sources={event.sources} onOpen={openSource} />
        </div>
        {trail.recorded.length > 0 && (
          <p className="override-trail__note">Explanation and evidence as the gate computes them now; the override stores the flag ids only.</p>
        )}
      </li>

      <li className="override-step override-step--action">
        <div className="override-step__head">
          <span className="override-step__label">Override</span>
          <span className="decision-tag">Reason recorded</span>
        </div>
        <p className="override-step__row">
          <span>By</span>
          {override.by}
        </p>
        <p className="override-step__row">
          <span>Time</span>
          <b className="mono">{new Date(override.at).toLocaleTimeString()}</b>
        </p>
        <p className="override-step__row">
          <span>Reason</span>“{override.reason}”
        </p>
        <p className="override-step__row">
          <span>Previous</span>
          {trail.previousStatus ? "Implausible" : "Not recorded"}
        </p>
      </li>

      <li className="override-step override-step--current">
        <div className="override-step__head">
          <span className="override-step__label">Current state</span>
          <StatusToken status={status} />
        </div>
      </li>
    </ol>
  );
}
