import { openFlagCount } from "./FlagsTab";
import { NotConnected, type PanelContext } from "./shared";

const SWATCHES = ["blue", "green"] as const;

export function WitnessesTab(context: PanelContext) {
  const { graph } = context;
  const witnesses = graph.actors.filter((actor) => actor.role === "witness");
  const single = witnesses.length === 1;

  return (
    <>
      <div className="section-title">
        <h2>Witness layers</h2>
        <span>
          {witnesses.length} {witnesses.length === 1 ? "statement" : "statements"} in reconstruction
        </span>
      </div>

      <div className="layer-toggle" role="group" aria-label="Witness layer visibility">
        <button type="button" className="active" disabled>
          Show all layers
        </button>
        <button type="button" disabled>
          This witness only
        </button>
      </div>

      <div className="witness-list">
        {witnesses.map((witness, i) => (
          <article className="witness-row" key={witness.id}>
            <div className={`witness-swatch ${SWATCHES[i % SWATCHES.length]}`} />
            <div className="witness-details">
              <div>
                <strong>{witness.label}</strong>
                <span>{witness.role}</span>
              </div>
              <div className="witness-counts">
                <span>
                  <b className="mono">{single ? graph.events.length : "–"}</b> events
                </span>
                <span>
                  <b className="mono">{single ? openFlagCount(context) : "–"}</b> open flags
                </span>
              </div>
            </div>
            <button type="button" className="button" disabled title="Interview screen not connected yet">
              Re-interview
            </button>
          </article>
        ))}
      </div>

      <NotConnected>
        Layers and per-witness counts need <code>witnessId</code> on resolved events. Re-interview opens the
        interview screen once it exists.
      </NotConnected>
    </>
  );
}
