const elements = new Map<string, HTMLDivElement>();

export function registerLabel(id: string, element: HTMLDivElement | null): void {
  if (element) elements.set(id, element);
  else elements.delete(id);
}

export function labelElements(): ReadonlyMap<string, HTMLDivElement> {
  return elements;
}
