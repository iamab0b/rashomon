import { actorLabel, FlagCard, PendingNote, words, type PanelContext } from "./shared";

export function openFlagCount({ graph, statusOf }: Pick<PanelContext, "graph" | "statusOf">): number {
  return graph.events
    .filter((event) => statusOf(event) !== "overridden")
    .reduce((count, event) => count + event.flags.length, 0);
}

async function copyText(text: string, notify: (message: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    notify("Question copied.");
  } catch {
    notify("Couldn't copy. Select the question text instead.");
  }
}

export function FlagsTab({ graph, statusOf, pendingNoteOf, selectedEventId, jumpTo, openOverride, notify }: PanelContext) {
  const flagged = graph.events
    .filter((event) => event.flags.length > 0 && statusOf(event) !== "overridden")
    .sort((a, b) => b.tStart - a.tStart);
  const open = flagged.reduce((count, event) => count + event.flags.length, 0);

  return (
    <>
      <div className="section-title">
        <h2>Open flags</h2>
        <span>Newest first · {open} open</span>
      </div>
      {flagged.length === 0 ? (
        <div className="flags-empty">
          <div>
            <strong>No open flags.</strong>
            <p>No check raised a flag under the current scene data.</p>
          </div>
        </div>
      ) : (
        <div className="flag-list">
          {flagged.flatMap((event) =>
            event.flags.map((flag) => (
              <div key={flag.id}>
                <FlagCard
                  flag={flag}
                  sceneId={graph.sceneId}
                  eventLabel={`${actorLabel(graph, event.actor)} · ${words(event.action)} · ${event.tStart.toFixed(1)} s`}
                  selected={selectedEventId === event.id}
                  onSelect={() => jumpTo(event.id)}
                  onOverride={() => openOverride(event.id)}
                  onCopy={(text) => void copyText(text, notify)}
                />
                <PendingNote note={pendingNoteOf(event)} />
              </div>
            )),
          )}
        </div>
      )}
    </>
  );
}
