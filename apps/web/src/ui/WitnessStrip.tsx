import type { PanelContext } from "./shared";
import { Icon } from "./Icon";
import { actorLabel, displayLabel } from "./shared";
import { isSolo, toggleSolo, type WitnessFilter } from "./witnessFilter";
import { witnessColor } from "./WitnessesTab";

export type WitnessStripProps = Pick<PanelContext, "graph" | "statusOf" | "openStatement"> & { filter: WitnessFilter };

function counts({ graph, statusOf }: Pick<PanelContext, "graph" | "statusOf">, witnessId: string) {
  const events = graph.events.filter((event) => event.witnessId === witnessId);
  const flags = events.filter((event) => statusOf(event) !== "overridden").reduce((n, event) => n + event.flags.length, 0);
  return { events: events.length, flags };
}

export function WitnessStrip({ graph, statusOf, openStatement, filter }: WitnessStripProps) {
  const { layers, hidden } = filter;
  if (layers.length === 0) return null;
  const many = layers.length > 1;

  return (
    <section className="witness-strip" aria-label="Witnesses">
      <span className="eyebrow witness-strip__head">Witnesses</span>
      <ul className="witness-strip__cards">
        {layers.map((layer) => {
          const shown = !hidden.has(layer.id);
          const solo = isSolo(filter, layer.id);
          const c = counts({ graph, statusOf }, layer.id);
          return (
            <li key={layer.id} className={`witness-card${shown ? "" : " is-hidden"}${solo ? " is-solo" : ""}`} data-witness-id={layer.id}>
              <div className="witness-card__name">
                <span className="witness-card__swatch" style={{ background: witnessColor(layers, layer.id) }} aria-hidden />
                <strong>{displayLabel(layer.label)}</strong>
                {layer.actorId && actorLabel(graph, layer.actorId) !== displayLabel(layer.label) && <span>{actorLabel(graph, layer.actorId)}</span>}
              </div>
              <div className="witness-card__counts">
                <span>
                  <b className="mono">{c.events}</b> {c.events === 1 ? "event" : "events"}
                </span>
                <span>
                  <b className={`mono${c.flags > 0 ? " has-flags" : ""}`}>{c.flags}</b> open {c.flags === 1 ? "flag" : "flags"}
                </span>
              </div>
              <div className="witness-card__actions">
                {many && (
                  <>
                    <button
                      type="button"
                      className="button button--small witness-card__icon"
                      aria-pressed={shown}
                      aria-label={`${shown ? "Hide" : "Show"} ${layer.label}`}
                      title={shown ? `Hide ${layer.label}'s events and transcript lines` : `Show ${layer.label}`}
                      onClick={() => filter.toggle(layer.id)}
                    >
                      <Icon name={shown ? "eye" : "eyeOff"} size={14} />
                    </button>
                    <button
                      type="button"
                      className="button button--small"
                      aria-pressed={solo}
                      title={solo ? "Show all witnesses again" : `Show only ${layer.label}`}
                      onClick={() => toggleSolo(filter, layer.id)}
                    >
                      Solo
                    </button>
                  </>
                )}
                <button type="button" className="button button--small witness-card__secondary" title={`Add a statement from ${layer.label}`} onClick={() => openStatement(layer.id)}>
                  Re-interview
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
