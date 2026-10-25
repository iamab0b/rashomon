export type ColorEntry = {
  readonly hex: string;
  readonly words: readonly string[];
};

export const CLOTHING_COLORS = {
  black: { hex: "#1c1c1c", words: ["black"] },
  white: { hex: "#f0f0f0", words: ["white"] },
  gray: { hex: "#7f7f7f", words: ["gray", "grey"] },
  red: { hex: "#b22222", words: ["red"] },
  maroon: { hex: "#7b1e2b", words: ["maroon", "burgundy"] },
  orange: { hex: "#e0731f", words: ["orange"] },
  yellow: { hex: "#e8c21c", words: ["yellow"] },
  green: { hex: "#2e7d32", words: ["green"] },
  olive: { hex: "#6b6b2a", words: ["olive", "khaki"] },
  blue: { hex: "#2554a8", words: ["blue"] },
  navy: { hex: "#1f2a48", words: ["navy"] },
  teal: { hex: "#1f7a7a", words: ["teal", "turquoise"] },
  purple: { hex: "#6a2c91", words: ["purple", "violet"] },
  pink: { hex: "#e48aaf", words: ["pink"] },
  brown: { hex: "#6b4423", words: ["brown"] },
  beige: { hex: "#cdb48c", words: ["beige", "tan"] },
} as const satisfies Record<string, ColorEntry>;

export type ClothingColor = keyof typeof CLOTHING_COLORS;

export const CLOTHING_COLOR_NAMES = Object.keys(CLOTHING_COLORS) as ClothingColor[];

export const isClothingColor = (name: string): name is ClothingColor =>
  Object.hasOwn(CLOTHING_COLORS, name);

export function colorStatedIn(name: ClothingColor, text: string): boolean {
  const lower = text.toLowerCase();
  return CLOTHING_COLORS[name].words.some((word) => new RegExp(`\\b${word}\\b`).test(lower));
}
