import { create } from "zustand";
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
};

export const useRigReportStore = create<RigReportState>((set) => ({
  reports: [],
  addReport: (report) =>
    set((state) => ({
      reports: [...state.reports.filter((existing) => existing.rig !== report.rig), report],
    })),
}));
