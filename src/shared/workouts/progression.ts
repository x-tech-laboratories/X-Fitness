// Progressive overload as Liftosaur builds it in (https://www.liftosaur.com/doc/liftoscript): linear adds weight after
// enough successful workouts and may take it off after enough failed ones, double walks the reps up a range before adding
// weight, and sum adds weight once the reps across all sets clear a threshold.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { LoggedSet, Progression, Target } from "./model.ts";

// ── Performance ──────────────────────────────────────────────────────────────

export interface Performance {
  sets: number;
  min_reps: number;
  total_reps: number;
  // The last weight lifted, or the planned one when none was logged.
  weight: number;
}

// The weakest set decides whether the target was met.
export function sets_performance(target: Target, sets: LoggedSet[]): Performance {
  const reps = sets.map((set) => set.reps);
  const lifted = sets.map((set) => set.weight).filter((weight) => weight > 0).at(-1);
  return {
    sets: sets.length,
    min_reps: reps.length > 0 ? Math.min(...reps) : 0,
    total_reps: reps.reduce((total, value) => total + value, 0),
    weight: lifted || target.weight,
  };
}

// Every prescribed set performed at or above its target reps.
export function target_met(target: Target, performance: Performance): boolean {
  return target.sets > 0 && target.reps > 0 && performance.sets >= target.sets && performance.min_reps >= target.reps;
}

// Rounded to the gram, so a percentage step leaves no float noise in the plan.
export function step_weight(weight: number, step: number, is_percent: boolean, direction: 1 | -1): number {
  if (step <= 0) return weight;
  const next = is_percent ? weight * (1 + (direction * step) / 100) : weight + direction * step;
  return Math.max(0, Math.round(next * 1000) / 1000);
}

// ── Evaluating ───────────────────────────────────────────────────────────────

export type Outcome = "hold" | "increase" | "decrease" | "reps";

export interface ProgressionResult {
  progression: Progression;
  changes: { reps?: number; weight?: number };
  outcome: Outcome;
  // Where a counter stands, such as "2/3 successes"; empty when nothing is counting.
  counter: string;
}

// An increase goes on the weight lifted and a decrease off the weight planned, and a miss leaves the success count standing, as Liftosaur's own scripts do.
export function evaluate_progression(progression: Progression, target: Target, sets: LoggedSet[]): ProgressionResult {
  const performance = sets_performance(target, sets);
  const met = target_met(target, performance);
  const hold: ProgressionResult = { progression, changes: {}, outcome: "hold", counter: "" };
  const increase = () => step_weight(performance.weight, progression.increment, progression.increment_percent, 1);

  if (progression.type === "linear") {
    if (met) {
      const success_counter = progression.success_counter + 1;
      if (success_counter < progression.successes) {
        return { ...hold, progression: { ...progression, success_counter }, counter: `${success_counter}/${progression.successes} successes` };
      }
      return { progression: { ...progression, success_counter: 0, failure_counter: 0 }, changes: { weight: increase() }, outcome: "increase", counter: "" };
    }
    if (progression.decrement <= 0) return hold;
    const failure_counter = progression.failure_counter + 1;
    if (failure_counter < progression.failures) {
      return { ...hold, progression: { ...progression, failure_counter }, counter: `${failure_counter}/${progression.failures} failures` };
    }
    return {
      progression: { ...progression, success_counter: 0, failure_counter: 0 },
      changes: { weight: step_weight(target.weight, progression.decrement, progression.decrement_percent, -1) },
      outcome: "decrease",
      counter: "",
    };
  }

  if (progression.type === "double") {
    const max_reps = Math.max(progression.min_reps, progression.max_reps);
    if (!met || max_reps <= 0) return hold;
    // At the top of the range the reps reset and the weight moves instead.
    if (performance.min_reps >= max_reps) return { progression, changes: { reps: progression.min_reps, weight: increase() }, outcome: "increase", counter: "" };
    return { progression, changes: { reps: Math.min(performance.min_reps + 1, max_reps) }, outcome: "reps", counter: "" };
  }

  // Sum asks only about the total reps, never whether each set met its target.
  if (progression.type === "sum") {
    if (progression.reps_threshold <= 0) return hold;
    if (performance.total_reps < progression.reps_threshold) return { ...hold, counter: `${performance.total_reps}/${progression.reps_threshold} reps` };
    return { progression, changes: { weight: increase() }, outcome: "increase", counter: "" };
  }

  return hold;
}
