import { useEffect, useRef } from "react";
import type { ResolvedEvent } from "../scene";
import { versionChain, versionChanges } from "./history";
import { OverrideHistory } from "./OverrideHistory";
import { scrollWithin } from "./scrollWithin";
import {
  actorLabel,
  eventTime,
  PendingNote,
  propName,
  SourceRefs,
  StatusToken,
  words,
  type PanelContext,
} from "./shared";

export function HistoryTab({
  graph,
  statusOf,
  pendingNoteOf,
  placeOf,
  selectedEventId,
  openSource,
  overrideFocusId = null,
}: PanelContext & { overrideFocusId?: string | null }) {
  const event = graph.events.find((e) => e.id === selectedEventId) ?? null;
  const focusRef = useRef<HTMLLIElement>(null);
  const focusOverride = event !== null && overrideFocusId === event.id;

  useEffect(() => {
    if (focusOverride) scrollWithin(focusRef.current);
  }, [focusOverride]);

  if (!event) {
    return (
      <div className="flags-empty history-empty">
        <div>
          <strong>No event selected</strong>
          <p>Select an event in Flags, Events, the timeline or the scene to see its history.</p>
        </div>
      </div>
    );
  }

  const chain = versionChain(graph.events, event.id);
  const describe = (e: ResolvedEvent): Record<string, string> => ({
    Actor: actorLabel(graph, e.actor),
    Action: words(e.action),
    Place: placeOf(e) ?? "",
    Target: e.target ? actorLabel(graph, e.target) : "",
    Holding: e.prop ? propName(graph, e.prop) : "",
    Time: eventTime(e),
  });

  return (
    <>
      <div className="section-title">
        <span className="eyebrow">Selected event</span>
        <h2>
          {event.id} · {actorLabel(graph, event.actor)} · {words(event.action)}
        </h2>
        <span>
          {eventTime(event)}
          {placeOf(event) ? ` · ${placeOf(event)}` : ""}
        </span>
      </div>

      <div className="subhead">Versions · newest first · {chain.length}</div>
      <ol className="version-list history-versions">
        {chain.map((version, i) => {
          const number = chain.length - i;
          const older = chain[i + 1];
          const changes = older ? versionChanges(older, version, describe) : [];
          const superseded = i > 0 || statusOf(version) === "superseded";
          const focused = focusOverride && Boolean(version.override);
          return (
            <li
              key={version.id}
              ref={focused ? focusRef : undefined}
              data-override-focus={focused || undefined}
              className={`version-card status-${statusOf(version)}${superseded ? " version-card--superseded" : ""}${
                version.id === event.id ? " version-card--viewing" : ""
              }`}
            >
              <div className="version-head">
                <span>
                  Version {number} <b>{superseded ? "Superseded" : "Current"}</b>
                </span>
                <StatusToken status={statusOf(version)} />
              </div>
              <strong>
                {version.id} · {words(version.action)}
              </strong>
              {older ? (
                changes.length > 0 ? (
                  <ul className="version-changes">
                    {changes.map((change) => (
                      <li key={change.field}>
                        <span>{change.field}</span> {change.from} → {change.to}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="version-note">Restated with no change to who, what, where or when.</p>
                )
              ) : (
                <p className="version-note">{chain.length > 1 ? "First statement." : "Only version on record."}</p>
              )}
              <div className="version-meta">
                <span className="mono">{eventTime(version)}</span>
                <SourceRefs sources={version.sources} onOpen={openSource} />
                {version.supersededBy && <span>Replaced by {version.supersededBy}</span>}
              </div>
              {(version.override || statusOf(version) === "overridden") && (
                <OverrideHistory graph={graph} event={version} status={statusOf(version)} openSource={openSource} />
              )}
            </li>
          );
        })}
      </ol>
      <PendingNote note={pendingNoteOf(event)} />
    </>
  );
}
