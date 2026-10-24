import { useEffect, useRef } from "react";
import { NotConnected, words, type PanelContext } from "./shared";
import { relatedUtterances, sourceLabel, speakerLabel, utteranceEvents } from "./transcript";

export function TranscriptView({
  graph,
  selectedEventId,
  transcript,
  jumpTo,
  focusId,
}: PanelContext & { focusId: string | null }) {
  const listRef = useRef<HTMLOListElement>(null);
  const event = graph.events.find((e) => e.id === selectedEventId) ?? null;
  const related = relatedUtterances(event);
  const firstRelated = transcript?.find((u) => related.has(u.id))?.id ?? null;
  const scrollTo = focusId ?? firstRelated;

  useEffect(() => {
    if (!scrollTo) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-utterance="${CSS.escape(scrollTo)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [scrollTo]);

  if (!transcript) {
    return (
      <NotConnected>
        The live transcript isn't connected yet
        {focusId ? (
          <>
            {" "}
            (<code>{focusId}</code>)
          </>
        ) : null}
        . Switch to Fixture to read the demo statements.
      </NotConnected>
    );
  }

  const byUtterance = utteranceEvents(graph.events);

  return (
    <>
      <div className="section-title">
        <span className="eyebrow">Transcript</span>
        <h2>{event ? `${event.id} · ${words(event.action)}` : "Full statement"}</h2>
        <span>
          {!event
            ? "Select an event to highlight the lines it comes from."
            : related.size === 0
              ? "No source recorded for this event."
              : `Cited by ${[...related].map(sourceLabel).join(", ")}`}
        </span>
      </div>
      <ol ref={listRef} className="utterance-list">
        {transcript.map((utterance) => {
          const isRelated = related.has(utterance.id);
          const isFocus = utterance.id === focusId;
          return (
            <li
              key={utterance.id}
              data-utterance={utterance.id}
              className={[isRelated && "related", isFocus && "focus"].filter(Boolean).join(" ") || undefined}
              aria-current={isRelated || undefined}
            >
              <span className="utterance-speaker">
                {speakerLabel(utterance.speaker)} · {sourceLabel(utterance.id)}
                <small className="mono">{utterance.id}</small>
              </span>
              <q>{utterance.text}</q>
              {(byUtterance.get(utterance.id) ?? []).length > 0 && (
                <span className="utterance-events">
                  {byUtterance.get(utterance.id)!.map((e) => (
                    <button
                      type="button"
                      key={e.id}
                      className={`event-chip mono${e.id === selectedEventId ? " selected" : ""}`}
                      aria-pressed={e.id === selectedEventId}
                      title={`Select ${e.id} · ${words(e.action)}`}
                      onClick={() => jumpTo(e.id)}
                    >
                      {e.id}
                    </button>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
