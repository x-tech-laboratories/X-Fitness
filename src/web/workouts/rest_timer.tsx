// The rest countdown between sets. It runs off a wall-clock deadline rather than counting ticks, so a phone that slept
// between sets comes back showing the time that is really left; at zero it says so and may chime.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { ProgressBar } from "@x-tech-laboratories/x-libs/web/react/progress";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { format_rest } from "./units.ts";

// ── Chime ────────────────────────────────────────────────────────────────────

// A rising two-note chime made on the spot, so there is no sound file to ship.
export function chime(): void {
  try {
    const context = new AudioContext();
    for (const [index, frequency] of [880, 1320].entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = context.currentTime + index * 0.18;
      oscillator.frequency.value = frequency;
      oscillator.connect(gain).connect(context.destination);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      oscillator.start(at);
      oscillator.stop(at + 0.18);
    }
    setTimeout(() => void context.close(), 800);
  } catch {
    // A page that may not play sound still shows the message.
  }
}

// ── Countdown ────────────────────────────────────────────────────────────────

export interface Countdown {
  // Seconds in all and left; ends_at is null while paused.
  total: number;
  remaining: number;
  ends_at: number | null;
}

export interface CountdownControls {
  countdown: Countdown | null;
  start: (seconds: number) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  extend: (seconds: number) => void;
}

// A countdown read again five times a second; on_done runs once when it reaches zero.
export function use_countdown(on_done: () => void): CountdownControls {
  const [countdown, set_countdown] = useState<Countdown | null>(null);

  useEffect(() => {
    if (!countdown?.ends_at) return;
    const timer = setInterval(() => {
      set_countdown((current) => (current?.ends_at ? { ...current, remaining: Math.max(0, Math.ceil((current.ends_at - Date.now()) / 1000)) } : current));
    }, 200);
    return () => clearInterval(timer);
  }, [countdown?.ends_at]);

  const done = Boolean(countdown?.ends_at) && countdown?.remaining === 0;
  useEffect(() => {
    if (!done) return;
    set_countdown(null);
    on_done();
  }, [done]);

  const controls = useMemo(
    () => ({
      start: (seconds: number) => {
        if (seconds > 0) set_countdown({ total: seconds, remaining: seconds, ends_at: Date.now() + seconds * 1000 });
      },
      stop: () => set_countdown(null),
      pause: () => set_countdown((current) => (current?.ends_at ? { ...current, ends_at: null } : current)),
      resume: () => set_countdown((current) => (current && !current.ends_at ? { ...current, ends_at: Date.now() + current.remaining * 1000 } : current)),
      extend: (seconds: number) =>
        set_countdown((current) => (current ? { total: current.total + seconds, remaining: current.remaining + seconds, ends_at: current.ends_at ? current.ends_at + seconds * 1000 : null } : current)),
    }),
    [],
  );
  return { countdown, ...controls };
}

// The rest timer of one workout: at zero it shows "Rest over." and chimes when the setting allows.
export function use_rest_timer(sound: boolean): CountdownControls {
  return use_countdown(() => {
    if (sound) chime();
    toast("Rest over.", { tone: "info" });
  });
}

// ── Bar ──────────────────────────────────────────────────────────────────────

export function RestTimerBar({ timer }: { timer: CountdownControls }) {
  const countdown = timer.countdown;
  if (!countdown) return null;
  const elapsed = countdown.total - countdown.remaining;
  return (
    <div className="workouts-rest" role="timer" aria-label="Rest timer">
      <strong className="workouts-rest-clock">{format_rest(countdown.remaining)}</strong>
      <ProgressBar value={elapsed} max={countdown.total} label="Rest" detail={countdown.ends_at ? "resting" : "paused"} class_name="workouts-rest-bar" />
      <span className="workouts-inline">
        <button type="button" onClick={() => timer.extend(30)} aria-label="Add 30 seconds">
          +30s
        </button>
        {countdown.ends_at ? (
          <button type="button" onClick={timer.pause}>
            Pause
          </button>
        ) : (
          <button type="button" onClick={timer.resume}>
            Resume
          </button>
        )}
        <button type="button" onClick={timer.stop}>
          Stop
        </button>
      </span>
    </div>
  );
}
