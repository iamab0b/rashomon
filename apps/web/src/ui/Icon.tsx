import type { ReactNode } from "react";

export type IconName = "eye" | "warning" | "x" | "chevron" | "chevronUp" | "copy" | "history" | "transcript";

const icons: Record<IconName, ReactNode> = {
  eye: (
    <>
      <path d="M2.5 10s2.7-4 7.5-4 7.5 4 7.5 4-2.7 4-7.5 4S2.5 10 2.5 10Z" />
      <circle cx="10" cy="10" r="2" />
    </>
  ),
  warning: (
    <>
      <path d="M10 3 18 17H2Z" />
      <path d="M10 8v4m0 2.2v.1" />
    </>
  ),
  x: <path d="m5 5 10 10M15 5 5 15" />,
  chevron: <path d="m6 8 4 4 4-4" />,
  chevronUp: <path d="m6 12 4-4 4 4" />,
  transcript: (
    <>
      <path d="M4 4.5h12M4 8.5h12M4 12.5h7" />
      <path d="M13.5 12.5 16 15.5" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6" />
      <path d="M3.5 3.5v3.2h3.2" />
      <path d="M10 6.5V10l2.5 1.5" />
    </>
  ),
  copy: (
    <>
      <rect x="7" y="7" width="9" height="9" rx="1.5" />
      <path d="M13 4H5.5A1.5 1.5 0 0 0 4 5.5V13" />
    </>
  ),
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {icons[name]}
    </svg>
  );
}
