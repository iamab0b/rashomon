import { applyViewKey, POV_KEY, PRESET_KEYS, useCamera, useGraph, type CameraPreset, type ResolvedGraph } from "../scene";
import "./view-switcher.css";

const OVERVIEW: CameraPreset = "overview";

export const POV_UNAVAILABLE = "POV position unavailable";

export type ViewOption = { key: string; label: string; active: boolean };

export function viewOptions(preset: CameraPreset, following: boolean): ViewOption[] {
  const overviewKey = Object.keys(PRESET_KEYS).find((key) => PRESET_KEYS[key] === OVERVIEW);
  const overview = overviewKey ? [{ key: overviewKey, label: "Overview", active: !following && preset === OVERVIEW }] : [];
  return [...overview, { key: POV_KEY, label: "POV", active: following }];
}

export type PovWitness = { id: string; label: string; hasPosition: boolean };

export function povWitnesses(graph: ResolvedGraph | null): PovWitness[] {
  if (!graph) return [];
  return graph.actors
    .filter((actor) => actor.role === "witness")
    .map((actor) => ({
      id: actor.id,
      label: actor.label,
      hasPosition: graph.events.some((event) => event.actor === actor.id),
    }));
}

export function povWitnessId(witnesses: readonly PovWitness[], explicit: string | null): string | null {
  if (explicit && witnesses.some((witness) => witness.id === explicit)) return explicit;
  return witnesses[0]?.id ?? null;
}

export function ViewSwitcher() {
  const { preset, following, povActor, setPovActor, setFollowing } = useCamera();
  const { resolved } = useGraph();
  const witnesses = povWitnesses(resolved);
  const witnessId = povWitnessId(witnesses, povActor);
  const witness = witnesses.find((w) => w.id === witnessId) ?? null;
  const unavailable = following && witness !== null && !witness.hasPosition;

  return (
    <div className="rui view-switcher">
      <div className="segmented" role="group" aria-label="Scene view">
        {viewOptions(preset, following).map((option) => (
          <button
            type="button"
            key={option.key}
            className={option.active ? "active" : undefined}
            aria-pressed={option.active}
            aria-keyshortcuts={option.key}
            aria-label={`${option.label} view`}
            onClick={() => applyViewKey(option.key)}
          >
            {option.label}
          </button>
        ))}
        {witnesses.length > 0 && (
          <select
            aria-label="Select POV witness"
            title="Select POV witness"
            className={following ? "active" : undefined}
            value={witnessId ?? ""}
            onChange={(e) => {
              setPovActor(e.currentTarget.value);
              if (!following) setFollowing(true);
            }}
          >
            {witnesses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {unavailable && (
        <p className="view-switcher__note" role="status">
          {POV_UNAVAILABLE} for {witness.label}.
        </p>
      )}
    </div>
  );
}
