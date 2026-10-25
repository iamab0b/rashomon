import { canOverride } from "./overridePending";
import type { Flag, ResolvedEvent } from "../scene";
import { actorLabel, eventTime, FlagCard, PendingNote, words, type PanelContext, type WitnessTag } from "./shared";

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

export function flagSides(
  { graph, witnessOf }: Pick<PanelContext, "graph" | "witnessOf">,
  event: ResolvedEvent,
  flag: Flag,
): { tag: WitnessTag; eventId: string }[] {
  if (flag.check !== "contradiction") return [];
  const own = witnessOf(event);
  if (!own) return [];
  const others = (flag.conflictsWith ?? []).flatMap((id) => {
    const other = graph.events.find((e) => e.id === id);
    const tag = other ? witnessOf(other) : null;
    return other && tag && tag.id !== own.id ? [{ tag, eventId: other.id }] : [];
  });
  return others.length > 0 ? [{ tag: own, eventId: event.id }, ...others] : [];
}

export function FlagsTab(context: PanelContext) {
  const { graph, statusOf, pendingNoteOf, selectedEventId, playbackActive, playing, jumpTo, openOverride, notify } = context;
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
                  eventLabel={`${event.id} · ${actorLabel(graph, event.actor)} · ${words(event.action)}`}
                  eventTimeLabel={eventTime(event)}
                  selected={selectedEventId === event.id}
                  playbackActive={playbackActive.has(event.id)}
                  playing={playing}
                  onSelect={() => jumpTo(event.id)}
                  onOverride={canOverride(statusOf(event)) ? () => openOverride(event.id) : undefined}
                  onCopy={(text) => void copyText(text, notify)}
                  sides={flagSides(context, event, flag)}
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
