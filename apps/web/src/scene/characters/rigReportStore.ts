import { create } from "zustand";
import type { RigDebugClipLine } from "./rigDebugGraph";
import type { Rig } from "./rigs";

export type RigReport = {
  rig: Rig;
  hipBone: string;
  hipY: number;
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
      reports: [...state.reports.filter((existing) => existing.rig !== report.rig), report],
    })),
  clipLines: [],
  setClipLines: (clipLines) => set({ clipLines }),
}));
