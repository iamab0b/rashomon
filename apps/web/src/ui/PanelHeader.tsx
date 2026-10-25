import type { CSSProperties } from "react";
import type { ResolvedEvent, ResolvedGraph } from "../scene";
import { eventNeighbors } from "./history";
import { Icon } from "./Icon";
import { actorLabel, eventTime, TimeBasisLabel, words, type TimeBasis } from "./shared";

export type HeaderTab = { id: string; label: string; count?: number };

export type PanelHeaderProps = {
  tabs: readonly HeaderTab[];
  activeTab: string;
  onTab: (id: string) => void;
  graph: ResolvedGraph;
  selectedEventId: string | null;
  placeOf: (event: ResolvedEvent) => string | null;
  timeBasisOf?: (event: ResolvedEvent) => TimeBasis;
  actorColorOf?: (actorId: string) => string;
  showSelection?: boolean;
  onJump: (eventId: string) => void;
};

export function PanelHeader({ tabs, activeTab, onTab, graph, selectedEventId, placeOf, timeBasisOf, actorColorOf, onJump, showSelection = true }: PanelHeaderProps) {
  const tabIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeTab),
  );
  const selectedEvent = graph.events.find((e) => e.id === selectedEventId) ?? null;
  const nav = eventNeighbors(graph.events, selectedEvent?.id ?? null);
  const step = (dir: -1 | 1) => {
    const target = dir === -1 ? nav.prev : nav.next;
    if (target) onJump(target.id);
  };
  const place = selectedEvent ? placeOf(selectedEvent) : null;

  return (
    <div className={showSelection ? "panel-head" : "panel-head panel-head--tabs-only"}>
      <nav className="tabs" role="tablist" style={{ "--tab-count": tabs.length, "--tab-index": tabIndex } as CSSProperties}>
        {tabs.map((t, i) => (
          <button
            type="button"
            role="tab"
            aria-selected={i === tabIndex}
            key={t.id}
            className={i === tabIndex ? "tab active" : "tab"}
            onClick={() => onTab(t.id)}
          >
            {t.label}
            {t.count !== undefined && <span>{t.count}</span>}
          </button>
        ))}
        <span className="tab-indicator" aria-hidden />
      </nav>

      {showSelection && (
        <div
          className="selection-bar"
          role="group"
          aria-label="Selected event"
          onKeyDown={(e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            step(e.key === "ArrowUp" ? -1 : 1);
          }}
        >
          <div>
            <span className="eyebrow">
              Selected event
              {nav.index >= 0 && (
                <small>
                  Event {nav.index + 1} of {nav.total}
                </small>
              )}
            </span>
            {selectedEvent ? (
              <>
                <strong>
                  {selectedEvent.id} ·{" "}
                  <span style={actorColorOf ? { color: actorColorOf(selectedEvent.actor) } : undefined}>{actorLabel(graph, selectedEvent.actor)}</span> ·{" "}
                  {words(selectedEvent.action)}
                </strong>
                <span className="selection-meta">
                  <span className="mono">{eventTime(selectedEvent)}</span>
                  {timeBasisOf && <TimeBasisLabel basis={timeBasisOf(selectedEvent)} />}
                  {place && <> · {place}</>}
                </span>
              </>
            ) : (
              <strong className="none">None selected</strong>
            )}
          </div>
          <div className="selection-nav">
            <button
              type="button"
              className="button button--small"
              aria-label="Previous event"
              title="Previous event"
              disabled={!nav.prev}
              onClick={() => step(-1)}
            >
              <Icon name="chevronUp" size={14} />
            </button>
            <button
              type="button"
              className="button button--small"
              aria-label="Next event"
              title="Next event"
              disabled={!nav.next}
              onClick={() => step(1)}
            >
              <Icon name="chevron" size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
