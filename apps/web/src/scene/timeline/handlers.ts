import { neighborFlag, nudgeDelta } from "./layout";

export type Drag = {
  down: (pointerId: number, button: number) => boolean;
  move: (pointerId: number) => boolean;
  end: (pointerId: number) => void;
  active: () => boolean;
};

export function createDrag(): Drag {
  let current: number | null = null;
  return {
    down: (pointerId, button) => {
      if (button !== 0 || current !== null) return false;
      current = pointerId;
      return true;
    },
    move: (pointerId) => current !== null && current === pointerId,
    end: (pointerId) => {
      if (current === pointerId) current = null;
    },
    active: () => current !== null,
  };
}

type Flags = { id: string; tStart: number }[];

export function makeJump(deps: {
  flags: Flags;
  t: number;
  select: (id: string) => void;
  setT: (t: number) => void;
}) {
  return (dir: 1 | -1) => {
    const target = neighborFlag(deps.flags, deps.t, dir);
    if (!target) return;
    deps.select(target.id);
    deps.setT(target.tStart);
  };
}

export type KeyLike = {
  key: string;
  shiftKey: boolean;
  target: EventTarget | { tagName?: string } | null;
  preventDefault: () => void;
};

export function makeKeyHandler(deps: { t: number; setT: (t: number) => void; toggle: () => void; duration?: number }) {
  return (event: KeyLike) => {
    if (event.key === " " && (event.target as { tagName?: string } | null)?.tagName !== "BUTTON") {
      event.preventDefault();
      deps.toggle();
      return;
    }
    if ((event.key === "Home" || event.key === "End") && deps.duration !== undefined) {
      event.preventDefault();
      deps.setT(event.key === "Home" ? 0 : deps.duration);
      return;
    }
    const delta = nudgeDelta(event.key, event.shiftKey);
    if (delta === null) return;
    event.preventDefault();
    deps.setT(deps.t + delta);
  };
}
