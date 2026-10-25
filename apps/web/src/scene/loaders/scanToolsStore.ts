import { create } from "zustand";
import type { LoadedScan } from "./scan";

export type ScanToolsState = {
  scan: LoadedScan | null;
  setScan: (scan: LoadedScan | null) => void;
};

export const useScanToolsStore = create<ScanToolsState>((set) => ({
  scan: null,
  setScan: (scan) => set({ scan }),
}));
