import { BASIS_LABELS, checkBasis, flagHeadline } from "./flagCopy";
import { Icon } from "./Icon";
import { eventCoordinates, placeName } from "./places";
import { inDisplayOrder } from "./playback";
import {
  activateOnKey,
  actorLabel,
  eventHolding,
  eventTarget,
  eventTime,
  TimeBasisLabel,
  PendingNote,
  PlaybackDot,
  SourceMeta,
  StatusToken,
  words,
  type PanelContext,
} from "./shared";
import { actorsWithEvents, focusedActor, matchesActor, visibleEvents } from "./witnessFilter";

export function ActorFilterBar({
  actors,
  active,
  labelOf,
  colorOf,
  onChange,
}: {
  actors: readonly string[];
  active: string | null;
  labelOf: (actorId: string) => string;
  colorOf: (actorId: string) => string;
  onChange: (actorId: string | null) => void;
}) {
  if (actors.length < 2) return null;
  return (
    <div className="actor-filter segmented" role="group" aria-label="Filter events by who acts">
      <button type="button" aria-pressed={active === null} className={active === null ? "active" : undefined} onClick={() => onChange(null)}>
        All
      </button>
      {actors.map((id) => (
        <button
          type="button"
          key={id}
          aria-pressed={active === id}
          className={active === id ? "active" : undefined}
          title={`Show only events where ${labelOf(id)} acts`}
          onClick={() => onChange(active === id ? null : id)}
        >
          <span className="witness-dot" style={{ background: colorOf(id) }} aria-hidden />
          {labelOf(id)}
        </button>
      ))}
    </div>
  );
}

export function EventsTab({
  graph,
  statusOf,
  pendingNoteOf,
  isPending,
  selectedEventId,
  playbackActive,
  playing,
  placeOf,
  timeBasisOf,
  witnessOf,
  actorColorOf,
  witnessFilter,
  actorFocus,
  jumpTo,
  openSource,
  openHistory,
}: PanelContext) {
  const all = inDisplayOrder(graph.events);
  const actors = actorsWithEvents(graph);
  const actor = focusedActor(actorFocus, actors);
  const events = matchesActor(visibleEvents(all, witnessFilter.hidden), actor);

  return (
    <>
      <div className="section-title">
        <h2>Event sequence</h2>
        <span>
          Chronological · {events.length === all.length ? `${all.length} events` : `${events.length} of ${all.length} events`}
        </span>
      </div>
      <ActorFilterBar actors={actors} active={actor} labelOf={(id) => actorLabel(graph, id)} colorOf={actorColorOf} onChange={actorFocus.setActor} />
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
                  <TimeBasisLabel basis={timeBasisOf(event)} />
                </span>
                <StatusToken status={status} pending={isPending(event)} />
              </div>
              <div className="investigation-event__body">
                <span className="event-actor" style={{ color: actorColorOf(event.actor) }}>
                  {actorLabel(graph, event.actor)}
                </span>
                <div className="event-what">
                  <strong className="event-action">{words(event.action)}</strong>
                  <span
                    className={place ? "event-place" : "event-place event-place--missing"}
                    title={coordinates ? `Scene position ${coordinates}` : undefined}
                  >
                    {place ?? "Location label not available"}
                  </span>
                  {details.map((detail) => (
                    <span className="event-anchor" key={detail}>
                      {detail}
                    </span>
                  ))}
                </div>
              </div>
              {flags.map((flag) => (
                <div className="event-flag" key={flag.id}>
                  <div className="flag-chips">
                    <span className="check-chip">{words(flag.check)}</span>
                    <span className={`severity-chip${flag.severity === "soft" ? " soft" : ""}`}>{flag.severity}</span>
                  </div>
                  <p>{flagHeadline(flag, (id) => placeName(graph.sceneId, id))}</p>
                  <small>{BASIS_LABELS[checkBasis(flag.check)]}</small>
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
                <SourceMeta sources={event.sources} onOpen={openSource} witness={witnessOf(event)} />
                <small className="event-id mono">{event.id}</small>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
