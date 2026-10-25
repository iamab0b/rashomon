import { BASIS_LABELS, checkBasis, flagHeadline } from "./flagCopy";
import { Icon } from "./Icon";
import { eventCoordinates, placeName } from "./places";
import { inDisplayOrder } from "./playback";
import { witnessColor } from "./WitnessesTab";
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
import { filterSummary, isSolo, visibleEvents, type WitnessFilter } from "./witnessFilter";

export function WitnessFilterBar({ filter, colorOf }: { filter: WitnessFilter; colorOf: (witnessId: string) => string }) {
  if (filter.layers.length < 2) return null;
  const summary = filterSummary(filter);
  return (
    <div className="witness-filter">
      <div className="segmented witness-filter__options" role="group" aria-label="Filter events by witness">
        <button type="button" aria-pressed={filter.hidden.size === 0} className={filter.hidden.size === 0 ? "active" : undefined} onClick={filter.showAll}>
          All
        </button>
        {filter.layers.map((layer) => {
          const on = isSolo(filter, layer.id);
          return (
            <button type="button" key={layer.id} aria-pressed={on} className={on ? "active" : undefined} onClick={() => filter.only(layer.id)}>
              <span className="witness-dot" style={{ background: colorOf(layer.id) }} aria-hidden />
              {layer.label}
            </button>
          );
        })}
      </div>
      {summary && (
        <p className="witness-filter__active" role="status">
          <span>Filtered: {summary}</span>
          <button type="button" className="button button--small" onClick={filter.showAll}>
            Show all
          </button>
        </p>
      )}
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
  jumpTo,
  openSource,
  openHistory,
}: PanelContext) {
  const all = inDisplayOrder(graph.events);
  const events = visibleEvents(all, witnessFilter.hidden);

  return (
    <>
      <div className="section-title">
        <h2>Event sequence</h2>
        <span>
          Chronological · {events.length === all.length ? `${all.length} events` : `${events.length} of ${all.length} events`}
        </span>
      </div>
      <WitnessFilterBar filter={witnessFilter} colorOf={(id) => witnessColor(witnessFilter.layers, id)} />
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
