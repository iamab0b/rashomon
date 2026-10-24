import { Icon } from "./Icon";
import { actorLabel, eventDetail, eventTime, PendingNote, StatusToken, words, type PanelContext } from "./shared";

export function EventsTab({ graph, statusOf, pendingNoteOf, selectedEventId, jumpTo }: PanelContext) {
  const events = [...graph.events].sort((a, b) => a.tStart - b.tStart);

  return (
    <>
      <div className="section-title">
        <h2>Event sequence</h2>
        <span>Chronological · {events.length} events</span>
      </div>
      <div className="investigation-events">
        {events.map((event) => {
          const status = statusOf(event);
          return (
            <button
              type="button"
              key={event.id}
              className={`investigation-event status-${status}${selectedEventId === event.id ? " selected" : ""}`}
              onClick={() => jumpTo(event.id)}
            >
              <div className="investigation-event__top">
                <time className="mono">{eventTime(event)}</time>
                <StatusToken status={status} />
              </div>
              <div className="investigation-event__body">
                <span className="event-actor">{actorLabel(graph, event.actor)}</span>
                <div>
                  <strong>{words(event.action)}</strong>
                  <span className="event-anchor mono">{eventDetail(graph, event)}</span>
                </div>
              </div>
              <div className="investigation-event__source">
                <span>{event.id} · source</span>
                <b className="mono">{event.sources.join(", ") || "none"}</b>
              </div>
              {status === "implausible" && (
                <div className="event-ruling">
                  <Icon name="warning" size={13} />
                  <span>The room rules this out as stated.</span>
                </div>
              )}
              <PendingNote note={pendingNoteOf(event)} />
              {status === "overridden" && (
                <div className="event-override-note">
                  <span className="status-diamond" />
                  Accepted with investigator reason
                </div>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
