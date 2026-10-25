import { create } from "zustand";
import { isUnitScale, METRES, type OriginChoice } from "./alignment";

export type ScanAlignState = {
  aligning: boolean;
  metresPerUnit: number;
  origin: OriginChoice;
  setAligning: (aligning: boolean) => void;
  setMetresPerUnit: (metresPerUnit: number) => void;
  setOrigin: (origin: OriginChoice) => void;
};

export const useScanAlignStore = create<ScanAlignState>((set) => ({
  aligning: false,
  metresPerUnit: METRES,
  origin: "click",
  setAligning: (aligning) => set({ aligning }),
  setMetresPerUnit: (metresPerUnit) => set({ metresPerUnit: isUnitScale(metresPerUnit) ? metresPerUnit : METRES }),
  setOrigin: (origin) => set({ origin }),
}));
