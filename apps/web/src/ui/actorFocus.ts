import { create } from "zustand";

type ActorFocus = { actor: string | null; setActor: (actor: string | null) => void };

export const useActorFocus = create<ActorFocus>((set) => ({
  actor: null,
  setActor: (actor) => set({ actor }),
}));
