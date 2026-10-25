import { canOverride } from "./overridePending";
import type { Flag, ResolvedEvent } from "../scene";
import { BASIS_LABELS, checkBasis, flagHeadline } from "./flagCopy";
import { Icon } from "./Icon";
import { placeName } from "./places";
import {
  actorLabel,
  eventTime,
  FlagCard,
  PendingNote,
  SourceMeta,
  StatusToken,
  WitnessChip,
  words,
  type PanelContext,
  type WitnessTag,
} from "./shared";

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

export type FlagCategory = "sightline" | "path" | "time" | "contradiction" | "missing";

export const CATEGORY_ORDER: readonly FlagCategory[] = ["sightline", "contradiction", "path", "time", "missing"];

export const CATEGORY_LABELS: Record<FlagCategory, string> = {
  sightline: "Sightline",
  contradiction: "Contradiction",
  path: "Path or movement",
  time: "Time",
  missing: "Missing details",
};

export function flagCategory(check: Flag["check"]): FlagCategory {
  switch (check) {
    case "sightline":
      return "sightline";
    case "contradiction":
      return "contradiction";
    case "reachability":
      return "path";
    case "time_distance":
      return "time";
    case "unanchored":
    case "missing_time":
      return "missing";
  }
}

type Single = { event: ResolvedEvent; flag: Flag };
export type ContradictionPair = { key: string; a: Single; b: { event: ResolvedEvent; flag: Flag | null } };

export function groupFlags(
  { graph }: Pick<PanelContext, "graph">,
  flagged: readonly ResolvedEvent[],
): { category: FlagCategory; singles: Single[]; pairs: ContradictionPair[] }[] {
  const byId = new Map(graph.events.map((event) => [event.id, event]));
  const groups = new Map<FlagCategory, { singles: Single[]; pairs: ContradictionPair[] }>();
  const seen = new Set<string>();
  for (const event of flagged) {
    for (const flag of event.flags) {
      const category = flagCategory(flag.check);
      const group = groups.get(category) ?? { singles: [], pairs: [] };
      groups.set(category, group);
      const other = category === "contradiction" ? byId.get(flag.conflictsWith?.[0] ?? "") : undefined;
      if (!other) {
        group.singles.push({ event, flag });
        continue;
      }
      const key = [event.id, other.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const back = other.flags.find((f) => f.check === "contradiction" && (f.conflictsWith ?? []).includes(event.id)) ?? null;
      group.pairs.push({ key, a: { event, flag }, b: { event: other, flag: back } });
    }
  }
  return CATEGORY_ORDER.filter((category) => groups.has(category)).map((category) => ({ category, ...groups.get(category)! }));
}

function ContradictionSide({
  context,
  event,
  differs,
}: {
  context: PanelContext;
  event: ResolvedEvent;
  differs: { place: boolean; witness: boolean };
}) {
  const { graph, statusOf, selectedEventId, placeOf, witnessOf, actorColorOf, jumpTo, openOverride, openSource } = context;
  const status = statusOf(event);
  const witness = witnessOf(event);
  return (
    <div
      className={`contradiction-side${selectedEventId === event.id ? " selected" : ""}`}
      role="button"
      tabIndex={0}
      data-event-id={event.id}
      aria-label={`View ${event.id}, ${eventTime(event)}, in the scene`}
      onClick={() => jumpTo(event.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          jumpTo(event.id);
        }
      }}
    >
      <div className="contradiction-side__top">
        <time className="mono">{eventTime(event)}</time>
        <StatusToken status={status} />
      </div>
      {witness && <span className={differs.witness ? "is-different" : undefined}><WitnessChip tag={witness} suffix=" says" /></span>}
      <strong>
        <span style={{ color: actorColorOf(event.actor) }}>{actorLabel(graph, event.actor)}</span> · {words(event.action)}
      </strong>
      <span className={`contradiction-side__place${differs.place ? " is-different" : ""}`}>{placeOf(event) ?? "Location label not available"}</span>
      <SourceMeta sources={event.sources} onOpen={openSource} />
      <span className="mono contradiction-side__id">{event.id}</span>
      {canOverride(status) && (
        <button
          type="button"
          className="button button--small"
          onClick={(e) => {
            e.stopPropagation();
            openOverride(event.id);
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          Override…
        </button>
      )}
    </div>
  );
}

function ContradictionCard({ context, pair }: { context: PanelContext; pair: ContradictionPair }) {
  const { graph, placeOf, witnessOf, notify } = context;
  const { a, b } = pair;
  const differs = {
    place: placeOf(a.event) !== placeOf(b.event),
    witness: a.event.witnessId !== b.event.witnessId,
  };
  const { distanceM, atTimeS } = a.flag.evidence;
  const questions = [a, b].flatMap((side) => (side.flag ? [{ event: side.event, flag: side.flag }] : []));
  return (
    <article className="contradiction-card" data-pair={pair.key}>
      <div className="contradiction-card__head">
        <div className="flag-chips">
          <span className="check-chip">contradiction</span>
          <span className={`severity-chip${a.flag.severity === "soft" ? " soft" : ""}`}>{a.flag.severity}</span>
        </div>
        <span className="flag-basis">{BASIS_LABELS[checkBasis(a.flag.check)]}</span>
      </div>
      <h3>{flagHeadline(a.flag, (id) => placeName(graph.sceneId, id))}</h3>
      <p className="contradiction-card__diff">
        {differs.witness ? "Two accounts place" : "One account places"} {actorLabel(graph, a.event.actor).toLowerCase()} in different spots
        {typeof atTimeS === "number" && <> at {atTimeS.toFixed(1)} s</>}
        {typeof distanceM === "number" && <>, {distanceM.toFixed(1)} m apart</>}.
      </p>
      <div className="contradiction-card__sides">
        <ContradictionSide context={context} event={a.event} differs={differs} />
        <span className="contradiction-card__vs" aria-hidden>
          vs
        </span>
        <ContradictionSide context={context} event={b.event} differs={differs} />
      </div>
      {questions.map(({ event, flag }) => {
        const witness = witnessOf(event);
        return (
          <div className="suggested-question" key={flag.id}>
            <span className="field-label">Ask {witness ? witness.label : "the witness"}</span>
            <blockquote>“{flag.suggestedQuestion}”</blockquote>
            <button type="button" className="button button--small" onClick={() => void copyText(flag.suggestedQuestion, notify)}>
              <Icon name="copy" size={13} />
              Copy
            </button>
          </div>
        );
      })}
      {[a.event, b.event].map((event) => (
        <PendingNote key={event.id} note={context.pendingNoteOf(event)} />
      ))}
    </article>
  );
}

export function FlagsTab(context: PanelContext) {
  const { graph, statusOf, pendingNoteOf, selectedEventId, playbackActive, playing, jumpTo, openOverride, notify } = context;
  const flagged = graph.events
    .filter((event) => event.flags.length > 0 && statusOf(event) !== "overridden")
    .sort((a, b) => b.tStart - a.tStart);
  const open = flagged.reduce((count, event) => count + event.flags.length, 0);
  const groups = groupFlags(context, flagged);

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
        groups.map(({ category, singles, pairs }) => (
          <section className="flag-category" key={category} aria-label={CATEGORY_LABELS[category]} data-category={category}>
            <h3 className="flag-category__label">
              {CATEGORY_LABELS[category]}
              <span className="mono">{singles.length + pairs.length}</span>
            </h3>
            <div className="flag-list">
              {pairs.map((pair) => (
                <ContradictionCard key={pair.key} context={context} pair={pair} />
              ))}
              {singles.map(({ event, flag }) => (
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
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
