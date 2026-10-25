import { useRef, type CSSProperties } from "react";
import { boxOfLandmark } from "./boxes";
import { useLabelingStore } from "./labelingStore";
import { LANDMARK_KINDS, type LandmarkKind } from "./kinds";
import { idErrorFor, labelErrorFor, landmarkErrors } from "./landmarkErrors";
import { applyManifest } from "./importFlow";
import { seedManifest } from "./seeds";
import { parseManifestText } from "./validate";

const panelStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: 10,
  color: "#f2f5f8",
  background: "rgba(11, 13, 16, 0.88)",
  border: "1px solid rgba(255, 255, 255, 0.25)",
  borderRadius: 6,
  font: "12px/1.4 system-ui, sans-serif",
};

const rowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 2, marginTop: 8 };
const inlineStyle: CSSProperties = { display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" };
const fieldStyle: CSSProperties = { width: "100%", boxSizing: "border-box" };

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label style={{ ...rowStyle, flex: 1, marginTop: 0 }}>
      {label}
      <input
        type="number"
        step={0.05}
        min={0.05}
        value={value}
        style={fieldStyle}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (Number.isFinite(next) && next > 0) onChange(next);
        }}
      />
    </label>
  );
}

export function LabelingPanel() {
  const store = useLabelingStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedEntry = store.entries.find((entry) => entry.key === store.selectedKey) ?? null;
  const selected = selectedEntry?.landmark ?? null;
  const key = selectedEntry?.key ?? 0;
  const errors = landmarkErrors(store.landmarks());
  const idError = idErrorFor(store.entries, key);
  const labelError = labelErrorFor(store.entries, key);

  const importFile = async (file: File) => {
    const result = parseManifestText(await file.text());
    if (result.ok) {
      if (await applyManifest(result.manifest)) useLabelingStore.getState().setMessage(`Imported ${result.manifest.sceneId}`);
    } else {
      store.setMessage(result.error);
    }
  };

  const exportManifest = () => {
    const manifest = store.toManifest();
    if (!manifest) return;
    if (errors.length > 0) {
      store.setMessage(errors[0] ?? null);
      return;
    }
    download(`${manifest.sceneId}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  };

  return (
    <div style={panelStyle} data-testid="labeling-panel">
      <div style={{ fontWeight: 600 }}>Landmark editor{store.base ? ` · ${store.base.sceneId}` : ""}</div>
      <div style={{ color: "#9aa7bd" }}>Click the floor to place a landmark.</div>

      <div style={inlineStyle}>
        <button onClick={() => store.save()}>Save</button>
        <button onClick={exportManifest}>Download</button>
        <button onClick={() => fileInput.current?.click()}>Import</button>
        <button onClick={() => void applyManifest(seedManifest())}>Load seed</button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void importFile(file);
          }}
        />
      </div>

      {store.message ? <div style={{ marginTop: 8, color: "#ffd24a" }}>{store.message}</div> : null}
      {errors.map((error) => (
        <div key={error} role="alert" style={{ marginTop: 4, color: "#ff6b5e" }}>
          {error}
        </div>
      ))}

      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 4 }}>
        {store.entries.map((entry) => (
          <button
            key={entry.key}
            onClick={() => store.select(entry.key)}
            style={{ fontWeight: entry.key === store.selectedKey ? 700 : 400 }}
          >
            {entry.landmark.label || entry.landmark.id || "(unnamed)"}
          </button>
        ))}
      </div>

      {selected ? (
        <div>
          <label style={rowStyle}>
            Label
            <input value={selected.label} style={fieldStyle} onChange={(event) => store.setLabel(key, event.currentTarget.value)} />
            {labelError ? <span role="alert" style={{ color: "#ff6b5e" }}>{labelError}</span> : null}
          </label>
          <label style={rowStyle}>
            Id
            <input value={selected.id} style={fieldStyle} onChange={(event) => store.setId(key, event.currentTarget.value)} />
            {idError ? <span role="alert" style={{ color: "#ff6b5e" }}>{idError}</span> : null}
          </label>
          <label style={rowStyle}>
            Aliases (comma-separated)
            <input
              key={key}
              defaultValue={selected.aliases.join(", ")}
              style={fieldStyle}
              onChange={(event) => store.setAliases(key, event.currentTarget.value)}
            />
          </label>
          <label style={rowStyle}>
            Kind
            <select
              value={selected.kind}
              style={fieldStyle}
              onChange={(event) => store.setKind(key, event.currentTarget.value as LandmarkKind)}
            >
              {LANDMARK_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
          <label style={{ ...rowStyle, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={selected.occludes} onChange={(event) => store.setOccludes(key, event.currentTarget.checked)} />
            Occludes sightlines
          </label>
          <div style={inlineStyle}>
            <NumberField label="Width (x)" value={boxOfLandmark(selected).width} onChange={(width) => store.setSize(key, { width })} />
            <NumberField label="Depth (z)" value={boxOfLandmark(selected).depth} onChange={(depth) => store.setSize(key, { depth })} />
            <NumberField label="Height (y)" value={boxOfLandmark(selected).height} onChange={(height) => store.setSize(key, { height })} />
          </div>
          <div style={inlineStyle}>
            <button onClick={() => store.remove(key)}>Delete</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
