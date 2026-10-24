import { LAYER_COLORS, useWitnessLayers, type ResolvedEvent, type WitnessLayer } from "../scene";
import { Icon } from "./Icon";
import { actorLabel, type PanelContext } from "./shared";

export function witnessColor(layers: readonly WitnessLayer[], witnessId: string): string {
  const index = layers.findIndex((layer) => layer.id === witnessId);
  return LAYER_COLORS[(index < 0 ? 0 : index) % LAYER_COLORS.length]!;
}

export function witnessName(layers: readonly WitnessLayer[], witnessId: string): string {
  return layers.find((layer) => layer.id === witnessId)?.label ?? witnessId;
}

export type Disagreement = { key: string; actor: string; atTimeS: number | null; distanceM: number | null; events: [ResolvedEvent, ResolvedEvent] };

export function disagreements({ graph }: Pick<PanelContext, "graph">): Disagreement[] {
  const byId = new Map(graph.events.map((event) => [event.id, event]));
  const seen = new Set<string>();
  const out: Disagreement[] = [];
  for (const event of graph.events) {
    for (const flag of event.flags) {
      if (flag.check !== "contradiction") continue;
      for (const otherId of flag.conflictsWith ?? []) {
        const other = byId.get(otherId);
        if (!other || other.witnessId === event.witnessId) continue;
        const key = [event.id, other.id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        const { atTimeS, distanceM } = flag.evidence;
        out.push({
          key,
          actor: event.actor,
          atTimeS: typeof atTimeS === "number" ? atTimeS : null,
          distanceM: typeof distanceM === "number" ? distanceM : null,
          events: [event, other],
        });
      }
    }
  }
  return out.sort((a, b) => (a.atTimeS ?? 0) - (b.atTimeS ?? 0));
}

function witnessCounts({ graph, statusOf }: Pick<PanelContext, "graph" | "statusOf">, witnessId: string) {
  const events = graph.events.filter((event) => event.witnessId === witnessId);
  const flags = events.filter((event) => statusOf(event) !== "overridden").reduce((n, event) => n + event.flags.length, 0);
  return { events: events.length, flags };
}

export type WitnessesTabViewProps = Pick<PanelContext, "graph" | "statusOf" | "placeOf" | "jumpTo"> & {
  layers: readonly WitnessLayer[];
  hidden: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onOnly: (id: string) => void;
  onShowAll: () => void;
};

export function WitnessesTabView({ graph, statusOf, placeOf, jumpTo, layers, hidden, onToggle, onOnly, onShowAll }: WitnessesTabViewProps) {
  const pairs = disagreements({ graph });
  const many = layers.length > 1;

  return (
    <>
      <div className="section-title">
        <h2>Witness layers</h2>
        <span>
          {layers.length} {layers.length === 1 ? "statement" : "statements"} in reconstruction
        </span>
      </div>

      {many && (
        <div className="witness-toolbar">
          <span>{hidden.size === 0 ? "All layers shown" : `${hidden.size} of ${layers.length} hidden`}</span>
          <button type="button" className="button button--small" disabled={hidden.size === 0} onClick={onShowAll}>
            Show all layers
          </button>
        </div>
      )}

      <div className="witness-list">
        {layers.map((layer) => {
          const counts = witnessCounts({ graph, statusOf }, layer.id);
          const shown = !hidden.has(layer.id);
          const alone = shown && hidden.size === layers.length - 1;
          return (
            <article className={`witness-row${shown ? "" : " is-hidden"}`} key={layer.id} data-witness-id={layer.id}>
              <div className="witness-swatch" style={{ background: witnessColor(layers, layer.id) }} aria-hidden />
              <div className="witness-details">
                <div>
                  <strong>{layer.label}</strong>
                  {layer.actorId && <span>{actorLabel(graph, layer.actorId)}</span>}
                </div>
                <div className="witness-counts">
                  <span>
                    <b className="mono">{counts.events}</b> {counts.events === 1 ? "event" : "events"}
                  </span>
                  <span>
                    <b className={`mono${counts.flags > 0 ? " has-flags" : ""}`}>{counts.flags}</b> open {counts.flags === 1 ? "flag" : "flags"}
                  </span>
                </div>
              </div>
              {many && (
                <div className="witness-actions">
                  <button
                    type="button"
                    className="button button--small witness-eye"
                    aria-pressed={shown}
                    aria-label={`${shown ? "Hide" : "Show"} ${layer.label}'s layer`}
                    title={shown ? "Hide this layer" : "Show this layer"}
                    onClick={() => onToggle(layer.id)}
                  >
                    <Icon name="eye" size={14} />
                    {shown ? "Shown" : "Hidden"}
                  </button>
                  <button type="button" className="button button--small" disabled={alone} onClick={() => onOnly(layer.id)}>
                    Only this
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {many && (
        <section className="witness-disagreements" aria-label="Where the witnesses disagree">
          <div className="section-title">
            <h2>Where they disagree</h2>
            <span>{pairs.length === 0 ? "No conflicts" : `${pairs.length} ${pairs.length === 1 ? "conflict" : "conflicts"}`}</span>
          </div>
          {pairs.length === 0 ? (
            <p className="witness-empty">The statements agree wherever they overlap.</p>
          ) : (
            <ul className="witness-conflicts">
              {pairs.map((pair) => (
                <li key={pair.key} className="witness-conflict">
                  <p className="witness-conflict__title">
                    {actorLabel(graph, pair.actor)}
                    {pair.atTimeS !== null && <span className="mono"> · {pair.atTimeS.toFixed(1)} s</span>}
                    {pair.distanceM !== null && <span> · {pair.distanceM.toFixed(1)} m apart</span>}
                  </p>
                  {pair.events.map((event) => (
                    <button type="button" key={event.id} className="witness-conflict__side" onClick={() => jumpTo(event.id)}>
                      <span className="witness-dot" style={{ background: witnessColor(layers, event.witnessId) }} aria-hidden />
                      <span className="witness-conflict__who">{witnessName(layers, event.witnessId)}</span>
                      <span className="witness-conflict__where">{placeOf(event) ?? "unplaced"}</span>
                      <span className="mono witness-conflict__id">{event.id}</span>
                    </button>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

export function WitnessesTab(context: PanelContext) {
  const { witnesses, hidden, toggle, only, showAll } = useWitnessLayers();
  return (
    <WitnessesTabView
      graph={context.graph}
      statusOf={context.statusOf}
      placeOf={context.placeOf}
      jumpTo={context.jumpTo}
      layers={witnesses}
      hidden={hidden}
      onToggle={toggle}
      onOnly={only}
      onShowAll={showAll}
    />
  );
}
