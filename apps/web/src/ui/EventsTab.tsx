import { flagHeadline } from "./flagCopy";
import { Icon } from "./Icon";
import { eventCoordinates, placeName } from "./places";
import { inDisplayOrder } from "./playback";
import {
  activateOnKey,
  actorLabel,
  eventHolding,
  eventTarget,
  eventTime,
  PendingNote,
  PlaybackDot,
  SourceRefs,
  StatusToken,
  words,
  type PanelContext,
} from "./shared";

export function EventsTab({
  graph,
  statusOf,
  pendingNoteOf,
  isPending,
  selectedEventId,
  playbackActive,
  playing,
  placeOf,
  jumpTo,
  openSource,
  openHistory,
}: PanelContext) {
  const events = inDisplayOrder(graph.events);

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
          const place = placeOf(event);
          const coordinates = eventCoordinates(event);
          const details = [eventTarget(graph, event), eventHolding(graph, event)].filter(Boolean);
          const flags = status === "overridden" ? [] : event.flags;
          return (
            <div
              role="button"
              tabIndex={0}
              key={event.id}
              className={`investigation-event status-${status}${selectedEventId === event.id ? " selected" : ""}`}
              data-event-id={event.id}
              data-playback-active={playbackActive.has(event.id) ? "true" : undefined}
              onClick={select}
              onKeyDown={activateOnKey(select)}
            >
              <div className="investigation-event__top">
                <span className="playback-when">
                  <PlaybackDot active={playbackActive.has(event.id)} playing={playing} />
                  <time className="mono">{eventTime(event)}</time>
                </span>
                {event.tInferred && <small className="event-inferred">time inferred</small>}
              </div>
              <div className="investigation-event__body">
                <strong>
                  {actorLabel(graph, event.actor)} · {words(event.action)}
                </strong>
                <span
                  className={place ? "event-place" : "event-place event-place--missing"}
                  title={coordinates ? `Scene position ${coordinates}` : undefined}
                >
                  {place ?? "Location label not available"}
                </span>
                {details.length > 0 && <span className="event-anchor">{details.join(" · ")}</span>}
              </div>
              <div className="investigation-event__status">
                <StatusToken status={status} pending={isPending(event)} />
              </div>
              {flags.map((flag) => (
                <div className="event-flag" key={flag.id}>
                  <span className="check-chip">{words(flag.check)}</span>
                  <span>{flagHeadline(flag, (id) => placeName(graph.sceneId, id))}</span>
                </div>
              ))}
              {status === "implausible" && flags.length === 0 && (
                <div className="event-ruling">
                  <Icon name="warning" size={13} />
                  <span>Not supported by current scene data.</span>
                </div>
              )}
              <PendingNote note={pendingNoteOf(event)} />
              {status === "overridden" && (
                <button
                  type="button"
                  className="event-override-note"
                  title="Show the override in History"
                  aria-label={`Overridden, reason recorded. Show ${event.id} override in History`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openHistory(event.id);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <span className="status-diamond" />
                  Overridden · Reason recorded
                </button>
              )}
              <div className="investigation-event__source">
                <SourceRefs sources={event.sources} onOpen={openSource} />
                <small className="mono">
                  {[event.id, ...event.sources].join(" · ")}
                </small>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
