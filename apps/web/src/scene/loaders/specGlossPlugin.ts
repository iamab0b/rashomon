import { Color, LinearSRGBColorSpace, SRGBColorSpace } from "three";
import type { GLTFLoaderPlugin, GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";

export const SPEC_GLOSS_EXTENSION = "KHR_materials_pbrSpecularGlossiness";

type TextureInfo = { index: number; texCoord?: number; extensions?: unknown };

type SpecGlossExtension = {
  diffuseFactor?: readonly number[];
  diffuseTexture?: TextureInfo;
};

type ParserLike = Pick<GLTFParser, "json" | "assignTexture">;

function extensionOf(parser: ParserLike, materialIndex: number): SpecGlossExtension | null {
  const material = (parser.json as { materials?: { extensions?: Record<string, unknown> }[] }).materials?.[materialIndex];
  const extension = material?.extensions?.[SPEC_GLOSS_EXTENSION];
  return extension && typeof extension === "object" ? (extension as SpecGlossExtension) : null;
}

export function specGlossPlugin(parser: ParserLike): GLTFLoaderPlugin {
  return {
    name: SPEC_GLOSS_EXTENSION,
    extendMaterialParams(materialIndex, params) {
      const extension = extensionOf(parser, materialIndex);
      if (!extension) return Promise.resolve();
      const factor = extension.diffuseFactor;
      if (Array.isArray(factor) && factor.length === 4) {
        const [r, g, b, a] = factor as [number, number, number, number];
        params.color = new Color().setRGB(r, g, b, LinearSRGBColorSpace);
        params.opacity = a;
        if (a < 1) params.transparent = true;
      }
      if (!extension.diffuseTexture) return Promise.resolve();
      return parser.assignTexture(params, "map", extension.diffuseTexture, SRGBColorSpace);
    },
  };
}
