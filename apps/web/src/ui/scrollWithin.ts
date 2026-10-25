export function nearestScrollTop(view: { top: number; height: number; scrollTop: number }, item: { top: number; height: number }): number {
  const above = item.top - view.top;
  const below = item.top + item.height - (view.top + view.height);
  if (above < 0) return view.scrollTop + above;
  if (below > 0) return view.scrollTop + Math.min(below, above);
  return view.scrollTop;
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

export function scrollWithin(el: HTMLElement | null | undefined): void {
  if (!el) return;
  const view = scrollParent(el);
  if (!view) return;
  const v = view.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  view.scrollTop = nearestScrollTop({ top: v.top, height: view.clientHeight, scrollTop: view.scrollTop }, { top: r.top, height: r.height });
}
