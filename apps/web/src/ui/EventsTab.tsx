import { Icon } from "./Icon";
import { eventPlace } from "./places";
import {
  activateOnKey,
  actorLabel,
  eventDetail,
  eventTime,
  PendingNote,
  SourceRefs,
  StatusToken,
  words,
  type PanelContext,
} from "./shared";

export function EventsTab({ graph, statusOf, pendingNoteOf, isPending, selectedEventId, jumpTo, openSource }: PanelContext) {
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
          const select = () => jumpTo(event.id);
          return (
            <div
              role="button"
              tabIndex={0}
              key={event.id}
              className={`investigation-event status-${status}${selectedEventId === event.id ? " selected" : ""}`}
              onClick={select}
              onKeyDown={activateOnKey(select)}
            >
              <div className="investigation-event__top">
                <time className="mono">{eventTime(event)}</time>
                <StatusToken status={status} pending={isPending(event)} />
              </div>
              <div className="investigation-event__body">
                <strong>
                  {actorLabel(graph, event.actor)} · {words(event.action)}
                </strong>
                <span className="event-place">{eventPlace(graph.sceneId, event)}</span>
                <span className="event-anchor">{eventDetail(graph, event)}</span>
              </div>
              {status === "implausible" && (
                <div className="event-ruling">
                  <Icon name="warning" size={13} />
                  <span>Not supported by current scene data.</span>
                </div>
              )}
              <PendingNote note={pendingNoteOf(event)} />
              {status === "overridden" && (
                <div className="event-override-note">
                  <span className="status-diamond" />
                  Overridden · Reason recorded
                </div>
              )}
              <div className="investigation-event__source">
                <SourceRefs sources={event.sources} onOpen={openSource} />
                <small className="mono">{event.id}</small>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
