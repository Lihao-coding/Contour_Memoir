import { useEffect, useRef, useState } from "react";

export const speeds = [0.5, 1, 2, 4] as const;
export const flightSpeed = 120;
export type Speed = (typeof speeds)[number] | typeof flightSpeed;

type Anchor = { elapsed: number; realTime: number };

export function elapsedFrom(anchor: Anchor, now: number, speed: Speed, duration: number): number {
  return Math.min(duration, anchor.elapsed + Math.max(0, now - anchor.realTime) * speed / 1000);
}

export function usePlayback(duration: number, canPlay: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [playing, setPlaying] = useState(false);
  const anchor = useRef<Anchor>({ elapsed: 0, realTime: 0 });

  function seek(seconds: number) {
    const target = Math.min(duration, Math.max(0, seconds));
    anchor.current = { elapsed: target, realTime: performance.now() };
    setElapsed(target);
  }

  function changeSpeed(next: Speed) {
    if (next === speed) return;
    if (playing) seek(elapsedFrom(anchor.current, performance.now(), speed, duration));
    setSpeed(next);
  }

  function toggle() {
    if (!canPlay) return;
    if (playing) {
      seek(elapsedFrom(anchor.current, performance.now(), speed, duration));
      setPlaying(false);
    } else {
      seek(elapsed >= duration ? 0 : elapsed);
      setPlaying(true);
    }
  }

  useEffect(() => {
    if (!canPlay && playing) {
      setElapsed(elapsedFrom(anchor.current, performance.now(), speed, duration));
      setPlaying(false);
      return;
    }
    if (!playing) return;
    let frame = 0;
    let last = -Infinity;
    function update(now: number) {
      const next = elapsedFrom(anchor.current, now, speed, duration);
      if (now - last >= 28 || next >= duration) {
        last = now;
        setElapsed(next);
      }
      if (next >= duration) setPlaying(false);
      else frame = requestAnimationFrame(update);
    }
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, duration, canPlay]);

  return { elapsed, speed, playing, toggle, seek, changeSpeed };
}
