import {
  eventDetail,
  eventTime,
  NotConnected,
  OverrideLog,
  PendingNote,
  StatusToken,
  words,
  type PanelContext,
} from "./shared";

export function HistoryTab({ graph, statusOf, pendingNoteOf, selectedEventId }: PanelContext) {
  const event = graph.events.find((e) => e.id === selectedEventId) ?? null;
  const overridden = graph.events.filter((e) => e.override);

  return (
    <>
      <div className="section-title">
        <span className="eyebrow">Selected event</span>
        <h2>{event ? `${event.id} · ${event.actor} · ${words(event.action)}` : "No event selected"}</h2>
        {!event && <span>Pick an event in the Events tab or the scene.</span>}
      </div>

      {event && (
        <div className="version-list">
          <article className={`version-card status-${statusOf(event)}`}>
            <div className="version-head">
              <span>
                Version {graph.version} <b>Current</b>
              </span>
              <StatusToken status={statusOf(event)} />
            </div>
            <strong>{eventDetail(graph, event)}</strong>
            <div className="version-meta">
              <span>{eventTime(event)}</span>
              <span>Source</span>
              {event.sources.map((source) => (
                <span key={source} className="source-chip">
                  {source}
                </span>
              ))}
              {event.flags.map((flag) => (
                <b key={flag.id} className="mono">
                  {words(flag.check)}
                </b>
              ))}
            </div>
          </article>
          <PendingNote note={pendingNoteOf(event)} />
          {event.override && <OverrideLog override={event.override} />}
        </div>
      )}

      <NotConnected>
        Earlier versions of an event (what the witness said before correcting it) need the scene to expose{" "}
        <code>supersededBy</code> on resolved events.
      </NotConnected>

      <div className="subhead">Overrides this session · {overridden.length}</div>
      {overridden.length === 0 ? (
        <div className="flags-empty">
          <p>No overrides yet. Override a flag from the Flags tab.</p>
        </div>
      ) : (
        overridden.map((e) => (
          <div key={e.id}>
            <span className="flag-event mono" style={{ marginTop: 10 }}>
              {e.id} · {e.actor} · {words(e.action)}
            </span>
            <OverrideLog override={e.override!} />
          </div>
        ))
      )}
    </>
  );
}
