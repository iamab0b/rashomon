import type { Object3D } from "three";

export async function loadDressingModels(
  urls: readonly string[],
  exists: (url: string) => Promise<boolean>,
  load: (url: string) => Promise<Object3D>,
): Promise<ReadonlyMap<string, Object3D>> {
  const loaded = await Promise.all(
    urls.map(async (url): Promise<readonly [string, Object3D] | null> => {
      if (!(await exists(url))) return null;
      try {
        return [url, await load(url)];
      } catch (error) {
        console.warn(`dressing model ${url} failed to load; keeping the placeholder`, error);
        return null;
      }
    }),
  );
  return new Map(loaded.filter((entry): entry is readonly [string, Object3D] => entry !== null));
}
