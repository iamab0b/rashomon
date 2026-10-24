import { FlagCard, type PanelContext } from "./shared";

export function openFlagCount({ graph, statusOf }: Pick<PanelContext, "graph" | "statusOf">): number {
  return graph.events
    .filter((event) => statusOf(event) !== "overridden")
    .reduce((count, event) => count + event.flags.length, 0);
}

export function FlagsTab({ graph, statusOf, jumpTo, openOverride }: PanelContext) {
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
            <p>The room agrees with everything stated so far.</p>
          </div>
        </div>
      ) : (
        <div className="flag-list">
          {flagged.flatMap((event) =>
            event.flags.map((flag) => (
              <FlagCard
                key={flag.id}
                flag={flag}
                eventLabel={`${event.id} · ${event.actor} · ${event.action}`}
                waived={false}
                onJump={() => jumpTo(event.id)}
                onOverride={() => openOverride(event.id)}
              />
            )),
          )}
        </div>
      )}
    </>
  );
}
