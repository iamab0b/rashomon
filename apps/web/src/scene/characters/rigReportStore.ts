import { create } from "zustand";
import type { RigDebugClipLine } from "./rigDebugGraph";

export type RigReport = {
  name: string;
  bones: number;
  hipBone: string;
  hipY: number;
  eyeY: number;
  eyeEstimated: boolean;
  height: number;
};

type RigReportState = {
  reports: readonly RigReport[];
  addReport: (report: RigReport) => void;
  clipLines: readonly RigDebugClipLine[];
  setClipLines: (lines: readonly RigDebugClipLine[]) => void;
};

export const useRigReportStore = create<RigReportState>((set) => ({
  reports: [],
  addReport: (report) =>
    set((state) => ({
      reports: [...state.reports.filter((existing) => existing.name !== report.name), report],
    })),
  clipLines: [],
  setClipLines: (clipLines) => set({ clipLines }),
}));
