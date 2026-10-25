import type { SceneManifest } from "@rashomon/schema";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { LoadedScan } from "../../loaders/scan";
import { useScanToolsStore } from "../../loaders/scanToolsStore";
import { callHook, callHookWithEffects, findElement } from "../../testing/hookHost";
import { LabelingPanel, suggestAdapter } from "../LabelingPanel";
import { useLabelingStore } from "../labelingStore";
import { manifestKey } from "../storage";
import { memoryStorage } from "../testStorage";
import { ProposalLayer } from "./ProposalLayer";
import { useProposalStore, type RenderViews, type SuggestDeps } from "./proposalStore";
import { SuggestLandmarks, type SuggestLandmarksProps } from "./SuggestLandmarks";
import { syntheticRoom } from "./testing/syntheticRoom";
import type { ToolProposal } from "./tool";
import type { SuggestTransport } from "./transport";

const initialLabeling = useLabelingStore.getState();
const initialTools = useScanToolsStore.getState();

const base: SceneManifest = {
  sceneId: "scan_wiring",
  meshUrl: "idb:wiring",
  up: "y",
  unitsPerMeter: 1,
  eyeHeight: 1.6,
  landmarks: [
    {
      id: "shelf_a",
      label: "Shelf A",
      aliases: [],
      position: [8, 0, 6],
      bounds: { min: [7.5, 0, 5.5], max: [8.5, 1, 6.5] },
      kind: "furniture",
      occludes: true,
    },
  ],
  interior: { min: [0, 0, 0], max: [9, 3, 7] },
};

const geom = syntheticRoom();
const model = {} as LoadedScan["model"];
const render: RenderViews = () => ["/9j/AAAA", "/9j/BBBB", "/9j/CCCC"];
const toolProposals: ToolProposal[] = [
  { candidate: "c1", label: "counter", kind: "occluder", occludes: true, confidence: 0.92, id: "counter" },
  { candidate: "c2", label: "shelf", kind: "occluder", occludes: true, confidence: 0.81, id: "shelf_a" },
  { candidate: "c3", label: "shelf", kind: "occluder", occludes: true, confidence: 0.77, id: "shelf_b" },
];
const deps: SuggestDeps = { transport: vi.fn<SuggestTransport>().mockResolvedValue({ proposals: toolProposals, dropped: 0 }), render };

function loadScan(): void {
  useScanToolsStore.setState({ scan: { geom, model } as LoadedScan });
}

function collect(node: ReactNode, matches: (props: Record<string, unknown>) => boolean, out: ReactElement<Record<string, unknown>>[] = []) {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, matches, out);
    return out;
  }
  if (typeof node !== "object" || node === null || !("props" in node)) return out;
  const element = node as ReactElement<Record<string, unknown>>;
  if (matches(element.props)) out.push(element);
  collect(element.props.children as ReactNode, matches, out);
  return out;
}

function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node !== "object" || node === null || !("props" in node)) return "";
  return text((node as ReactElement<{ children?: ReactNode }>).props.children);
}

function suggestProps(): SuggestLandmarksProps {
  const panel = callHook(() => LabelingPanel());
  const element = findElement(panel, (props) => "adapter" in props && "scan" in props);
  expect(element).not.toBeNull();
  return element!.props as SuggestLandmarksProps;
}

function suggestButton(props: SuggestLandmarksProps): ReactElement<{ disabled?: boolean; onClick?: () => void }> {
  const tree = callHook(() => SuggestLandmarks(props));
  return findElement(tree, (p) => "disabled" in p && text(p.children as ReactNode) === "Suggest landmarks") as ReactElement<{ disabled?: boolean }>;
}

beforeEach(() => {
  useLabelingStore.setState(initialLabeling, true);
  useScanToolsStore.setState(initialTools, true);
  useProposalStore.getState().clear();
  useLabelingStore.getState().begin(base);
});

afterEach(() => {
  useLabelingStore.setState(initialLabeling, true);
  useScanToolsStore.setState(initialTools, true);
  useProposalStore.getState().clear();
});

describe("Suggest landmarks in the labeling panel", () => {
  test("with a scan loaded the panel passes it as geom and model with the real adapter, and the button is enabled", () => {
    loadScan();
    const props = suggestProps();
    expect(props.scan).toEqual({ geom, model });
    expect(props.adapter).toBe(suggestAdapter);
    expect(suggestButton(props).props.disabled).toBe(false);
  });

  test("without a scan the button is disabled with a short reason", () => {
    const props = suggestProps();
    expect(props.scan).toBeNull();
    expect(suggestButton(props).props.disabled).toBe(true);
    expect(text(callHook(() => SuggestLandmarks(props)))).toContain("Load a scan to get suggestions.");
  });

  test("without the dev server the button is disabled and says so", () => {
    loadScan();
    const props = { ...suggestProps(), deps: null };
    expect(suggestButton(props).props.disabled).toBe(true);
    expect(text(callHook(() => SuggestLandmarks(props)))).toContain("Suggest landmarks needs the dev server");
  });
});

describe("proposals in the editor", () => {
  async function suggested(): Promise<SuggestLandmarksProps> {
    loadScan();
    const props = { ...suggestProps(), deps };
    await useProposalStore.getState().suggest(props.scan!, deps);
    return props;
  }

  test("a faked suggestion draws one numbered marker per proposal", async () => {
    await suggested();
    const markers = collect(callHook(() => ProposalLayer()), (props) => "proposal" in props);
    expect(markers.map((m) => (m.props.proposal as { number: number }).number)).toEqual([1, 2, 3]);
    expect(useLabelingStore.getState().entries).toHaveLength(1);
  });

  test("confirming proposal 2 adds exactly one landmark with the candidate's bounds and a unique id, and Save writes only it", async () => {
    const props = await suggested();
    const proposal = useProposalStore.getState().proposals.find((p) => p.number === 2)!;
    const rows = collect(callHook(() => SuggestLandmarks(props)), (p) => p["data-testid"] === "landmark-proposal");
    const row = rows.find((r) => text(r.props.children as ReactNode).startsWith("2"))!;
    const confirm = findElement(row.props.children as ReactNode, (p) => p.children === "Confirm")!;
    (confirm.props as { onClick: () => void }).onClick();

    const entries = useLabelingStore.getState().entries;
    expect(entries).toHaveLength(2);
    expect(entries[1]!.landmark).toEqual({
      id: "shelf_a_2",
      label: "Shelf",
      aliases: ["shelf"],
      position: proposal.candidate.position,
      bounds: proposal.candidate.bounds,
      kind: "furniture",
      occludes: true,
    });
    expect(useProposalStore.getState().proposals.map((p) => p.number)).toEqual([1, 3]);
    expect(useProposalStore.getState().portals?.waypoints.length).toBeGreaterThan(0);

    const storage = memoryStorage();
    expect(useLabelingStore.getState().save(storage)).toBe(true);
    const saved = JSON.parse(storage.data.get(manifestKey(base.sceneId))!) as SceneManifest;
    expect(saved.landmarks.map((l) => l.id)).toEqual(["shelf_a", "shelf_a_2"]);
    expect(saved.portals).toBeUndefined();
  });

  test("delete removes a proposal without touching the landmarks", async () => {
    const props = await suggested();
    const rows = collect(callHook(() => SuggestLandmarks(props)), (p) => p["data-testid"] === "landmark-proposal");
    const row = rows.find((r) => text(r.props.children as ReactNode).startsWith("3"))!;
    const remove = findElement(row.props.children as ReactNode, (p) => p.children === "Delete")!;
    (remove.props as { onClick: () => void }).onClick();
    expect(useProposalStore.getState().proposals.map((p) => p.number)).toEqual([1, 2]);
    expect(useLabelingStore.getState().entries.map((e) => e.landmark.id)).toEqual(["shelf_a"]);
  });

  test("pending proposals survive a remount on the same scan", async () => {
    const props = await suggested();
    callHookWithEffects(() => SuggestLandmarks(props));
    expect(useProposalStore.getState().proposals).toHaveLength(3);
  });

  test("pending proposals from another scan are cleared when the scan changes", async () => {
    await suggested();
    useScanToolsStore.setState({ scan: { geom: syntheticRoom(0.5), model } as LoadedScan });
    const props = suggestProps();
    expect(useProposalStore.getState().proposals).toHaveLength(3);
    callHookWithEffects(() => SuggestLandmarks(props));
    expect(useProposalStore.getState().proposals).toEqual([]);
  });
});
