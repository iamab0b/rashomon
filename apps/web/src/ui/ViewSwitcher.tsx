import { useCamera, useGraph, type CameraPreset, type ResolvedGraph } from "../scene";
import "./view-switcher.css";
import { displayLabel } from "./shared";

const VISIBLE_PRESETS: { id: CameraPreset; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "witness_claimed", label: "Claimed sightline" },
];

export const POV_UNAVAILABLE = "POV position unavailable";

export type ViewOption = { id: CameraPreset | "pov"; label: string; active: boolean };

export function viewOptions(preset: CameraPreset, following: boolean): ViewOption[] {
  return [
    ...VISIBLE_PRESETS.map((p) => ({ id: p.id, label: p.label, active: !following && preset === p.id })),
    { id: "pov" as const, label: "POV", active: following },
  ];
}

export type PovWitness = { id: string; label: string; hasPosition: boolean };

export function povWitnesses(graph: ResolvedGraph | null): PovWitness[] {
  if (!graph) return [];
  return graph.actors
    .filter((actor) => actor.role === "witness")
    .map((actor) => ({
      id: actor.id,
      label: displayLabel(actor.label),
      hasPosition: graph.events.some((event) => event.actor === actor.id),
    }));
}

export function povWitnessId(witnesses: readonly PovWitness[], explicit: string | null): string | null {
  if (explicit && witnesses.some((witness) => witness.id === explicit)) return explicit;
  return witnesses[0]?.id ?? null;
}

export type ViewSwitcherViewProps = {
  preset: CameraPreset;
  following: boolean;
  witnesses: readonly PovWitness[];
  witnessId: string | null;
  onPreset: (preset: CameraPreset) => void;
  onTogglePov: () => void;
  onWitness: (witnessId: string) => void;
};

export function ViewSwitcherView({ preset, following, witnesses, witnessId, onPreset, onTogglePov, onWitness }: ViewSwitcherViewProps) {
  const witness = witnesses.find((w) => w.id === witnessId) ?? null;
  const unavailable = following && witness !== null && !witness.hasPosition;
  return (
    <div className="rui view-switcher">
      <div className="segmented" role="group" aria-label="Scene view">
        {viewOptions(preset, following).map((option) => (
          <button
            type="button"
            key={option.id}
            className={option.active ? "active" : undefined}
            aria-pressed={option.active}
            onClick={() => (option.id === "pov" ? onTogglePov() : onPreset(option.id))}
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
            onChange={(e) => onWitness(e.currentTarget.value)}
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

export function ViewSwitcher() {
  const { preset, setPreset, following, togglePov, povActor, setPovActor, setFollowing } = useCamera();
  const { resolved } = useGraph();
  const witnesses = povWitnesses(resolved);
  return (
    <ViewSwitcherView
      preset={preset}
      following={following}
      witnesses={witnesses}
      witnessId={povWitnessId(witnesses, povActor)}
      onPreset={setPreset}
      onTogglePov={togglePov}
      onWitness={(id) => {
        setPovActor(id);
        if (!following) setFollowing(true);
      }}
    />
  );
}
