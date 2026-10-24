export type DragPoint = readonly [number, number, number];

export type DragSession = {
  start: () => void;
  move: (point: DragPoint) => void;
  cancel: () => boolean;
  end: () => DragPoint | null;
  active: () => boolean;
};

export function createDragSession(): DragSession {
  let running = false;
  let cancelled = false;
  let last: DragPoint | null = null;
  return {
    start() {
      running = true;
      cancelled = false;
      last = null;
    },
    move(point) {
      if (running && !cancelled) last = point;
    },
    cancel() {
      if (!running || cancelled) return false;
      cancelled = true;
      return true;
    },
    end() {
      const dropped = running && !cancelled ? last : null;
      running = false;
      cancelled = false;
      last = null;
      return dropped;
    },
    active: () => running && !cancelled,
  };
}
