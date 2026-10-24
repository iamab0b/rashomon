export type PlayheadMemo = {
  readonly anchorT: number;
  readonly anchorClockS: number;
  readonly lastWritten: number;
};

export type PlayheadInput = {
  readonly t: number;
  readonly playing: boolean;
  readonly duration: number;
  readonly clockS: number;
};

export type PlayheadStep = {
  readonly t: number;
  readonly playing: boolean;
  readonly memo: PlayheadMemo | null;
};

export function stepPlayhead(memo: PlayheadMemo | null, input: PlayheadInput): PlayheadStep {
  if (!input.playing) return { t: input.t, playing: false, memo: null };
  const scrubbed = memo === null || input.t !== memo.lastWritten;
  const anchorT = scrubbed ? input.t : memo.anchorT;
  const anchorClockS = scrubbed ? input.clockS : memo.anchorClockS;
  const t = Math.min(Math.max(anchorT + (input.clockS - anchorClockS), 0), input.duration);
  if (t >= input.duration) return { t, playing: false, memo: null };
  return { t, playing: true, memo: { anchorT, anchorClockS, lastWritten: t } };
}
