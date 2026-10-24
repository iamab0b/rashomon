import { describe, expect, test } from "vitest";
import { stepPlayhead, type PlayheadMemo } from "./playhead";

type Run = { t: number; playing: boolean; memo: PlayheadMemo | null };

function makeClock(duration: number) {
  let run: Run = { t: 0, playing: true, memo: null };
  return {
    tick(clockS: number): Run {
      const step = stepPlayhead(run.memo, { t: run.t, playing: run.playing, duration, clockS });
      run = { t: step.t, playing: step.playing, memo: step.memo };
      return run;
    },
    scrub(t: number): void {
      run = { ...run, t };
    },
    pause(): void {
      run = { ...run, playing: false };
    },
    play(): void {
      run = { ...run, playing: true };
    },
    get state(): Run {
      return run;
    },
  };
}

describe("stepPlayhead", () => {
  test("advances t with the clock from where play started", () => {
    const clock = makeClock(24);
    clock.tick(100);

    expect(clock.tick(101.5).t).toBeCloseTo(1.5);
    expect(clock.tick(103).t).toBeCloseTo(3);
  });

  test("a scrub while playing re-anchors instead of being overwritten", () => {
    const clock = makeClock(24);
    clock.tick(10);
    clock.tick(12);

    clock.scrub(15);
    expect(clock.tick(12.5).t).toBeCloseTo(15);
    expect(clock.tick(13.5).t).toBeCloseTo(16);
  });

  test("a scrub backward while playing also sticks", () => {
    const clock = makeClock(24);
    clock.tick(0);
    clock.tick(8);

    clock.scrub(2);
    clock.tick(8.25);

    expect(clock.tick(9.25).t).toBeCloseTo(3);
    expect(clock.state.playing).toBe(true);
  });

  test("playing to the end clamps t to the duration and stops", () => {
    const clock = makeClock(24);
    clock.tick(0);

    const atEnd = clock.tick(30);

    expect(atEnd.t).toBe(24);
    expect(atEnd.playing).toBe(false);
    expect(atEnd.memo).toBeNull();
  });

  test("once stopped, the clock no longer moves t", () => {
    const clock = makeClock(24);
    clock.tick(0);
    clock.tick(30);

    expect(clock.tick(40).t).toBe(24);
  });

  test("pausing holds t, and resuming continues from the held t", () => {
    const clock = makeClock(24);
    clock.tick(0);
    clock.tick(4);
    clock.pause();
    clock.tick(50);

    clock.play();
    clock.tick(60);

    expect(clock.tick(61).t).toBeCloseTo(5);
  });

  test("never goes below zero", () => {
    const clock = makeClock(24);
    clock.scrub(-3);

    expect(clock.tick(5).t).toBe(0);
  });

  test("speed scales how fast t advances, and a speed change re-anchors without a jump", () => {
    let memo: PlayheadMemo | null = null;
    const step = (t: number, clockS: number, speed: number) => {
      const next = stepPlayhead(memo, { t, playing: true, duration: 24, clockS, speed });
      memo = next.memo;
      return next.t;
    };
    let t = step(0, 0, 2);
    t = step(t, 1, 2);
    expect(t).toBeCloseTo(2);

    t = step(t, 2, 0.5);
    expect(t).toBeCloseTo(2);
    t = step(t, 4, 0.5);
    expect(t).toBeCloseTo(3);
  });
});
