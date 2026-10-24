export type PlayheadMemo = {
  readonly anchorT: number;
  readonly anchorClockS: number;
  readonly lastWritten: number;
  readonly speed: number;
};

export type PlayheadInput = {
  readonly t: number;
  readonly playing: boolean;
  readonly duration: number;
  readonly clockS: number;
  readonly speed?: number;
};

export type PlayheadStep = {
  readonly t: number;
  readonly playing: boolean;
  readonly memo: PlayheadMemo | null;
};

export function stepPlayhead(memo: PlayheadMemo | null, input: PlayheadInput): PlayheadStep {
  if (!input.playing) return { t: input.t, playing: false, memo: null };
  const speed = input.speed ?? 1;
  const reanchor = memo === null || input.t !== memo.lastWritten || speed !== memo.speed;
  const anchorT = reanchor ? input.t : memo.anchorT;
  const anchorClockS = reanchor ? input.clockS : memo.anchorClockS;
  const t = Math.min(Math.max(anchorT + (input.clockS - anchorClockS) * speed, 0), input.duration);
  if (t >= input.duration) return { t, playing: false, memo: null };
  return { t, playing: true, memo: { anchorT, anchorClockS, lastWritten: t, speed } };
}
