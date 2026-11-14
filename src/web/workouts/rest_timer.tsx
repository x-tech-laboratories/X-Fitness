// The rest countdown between sets. It runs off a wall-clock deadline rather than counting ticks, so a phone that slept
// between sets comes back showing the time that is really left; at zero it says so and may chime.

// ── Imports ──────────────────────────────────────────────────────────────────

import { ProgressBar } from "@x-tech-laboratories/x-libs/web/react/progress";
import { use_countdown, type CountdownControls } from "@x-tech-laboratories/x-libs/web/react/time";
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
      <span className="inline-row">
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
