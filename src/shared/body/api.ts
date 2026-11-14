// The body calls described for other programs: what each does and the arguments it takes.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { MethodSpec } from "@x-tech-laboratories/x-libs/api_spec";

import { day, id_of, step, text } from "../api_schemas.ts";
import { body_goal_keys, metric_roles } from "./readings.ts";

// ── Calls ────────────────────────────────────────────────────────────────────

const days_back = { type: "integer", minimum: 0, description: "How many days back from today; 0 for all time." };

export const body_api = {
  list_body_metrics: {
    description: "Lists the body metrics, such as weight or waist, in order, with how many readings each has and the last day read.",
    params: [],
  },
  save_body_metric: {
    description: "Adds a body metric, or changes the one with the id given. Gives back its id. A metric says only what is measured; goals are set with set_body_goal.",
    params: [
      {
        name: "metric",
        schema: {
          type: "object",
          properties: {
            id: text("The metric's id when changing it; leave out to add one."),
            name: text("Such as Weight or Waist."),
            kind: { type: "string", enum: ["weight", "length", "percent", "custom"], description: "weight is kept in kg, length in cm." },
            unit: text("The unit's label for a custom metric, such as bpm."),
            comment: text("A note on the metric."),
            role: {
              type: "string",
              enum: metric_roles.map((role) => role.key),
              description:
                "What the metric stands for: body_fat for a percent metric; a girth, which also shapes the 3D body, or a caliper skinfold such as skinfold_thigh for a length metric; height for the length metric the height is read from; resting_heart_rate for a custom metric in bpm; empty for nothing. The calculators read their measures by role.",
            },
          },
          required: ["name"],
        },
      },
    ],
  },
  move_body_metric: { description: "Moves a metric one place in the list.", params: [{ name: "id", schema: id_of("metric") }, { name: "delta", schema: step }] },
  delete_body_metric: { description: "Deletes a metric with all its readings. Gives back how many readings went.", params: [{ name: "id", schema: id_of("metric") }] },
  get_body_day: {
    description: "One day's readings for every metric, each with the reading before it, the day's note, and BMI from the latest weight and height readings.",
    params: [{ name: "date", schema: day }],
  },
  set_body_reading: {
    description: "Sets one metric's reading for a day, in kg for weights and cm for lengths; null or 0 removes it.",
    params: [
      { name: "metric_id", schema: id_of("metric") },
      { name: "date", schema: day },
      { name: "value", schema: { type: ["number", "null"], description: "The reading in the metric's stored unit." } },
    ],
  },
  set_body_note: { description: "Sets the note for a day; an empty note removes it.", params: [{ name: "date", schema: day }, { name: "comment", schema: text("The note.") }] },
  get_body_report: {
    description:
      "One metric's readings over a range, with a moving average, statistics, the goal it stands for (the weight goal for the first weight metric, else the goal named by its role, from list_body_goals) and how far is left to it, and BMI for the weight metric from the height reading on its latest day.",
    params: [{ name: "metric_id", schema: id_of("metric") }, { name: "days", schema: days_back }, { name: "today", schema: day }],
  },
  get_body_shape: {
    description:
      "What the 3D body is drawn from on a day: the sex from the body.sex setting, the latest height, weight, body fat and girths by role on or before the day in kg, percent and cm, the same at the body goals (each goal in place of its reading where one is set), and every day with such a reading.",
    params: [{ name: "date", schema: day }],
  },
  list_body_goals: {
    description:
      "Lists the body goals set: where the person wants to be, each kept apart from the metrics and needing none. Each has a key (weight, body_fat or a girth such as waist) and a value in kg, percent or cm. Weight, body fat and waist come first.",
    params: [],
  },
  set_body_goal: {
    description: "Sets the body goal for one key, replacing any goal it had; null or 0 removes it. The Goals page shows these under Where I want to be.",
    params: [
      {
        name: "key",
        schema: { type: "string", enum: body_goal_keys.map((goal) => goal.key), description: "What the goal is about: weight, body_fat, or a girth such as waist, hips or upper_arm." },
      },
      { name: "value", schema: { type: ["number", "null"], description: "The goal in kg for weight, percent for body_fat and cm for a girth; null or 0 removes it." } },
    ],
  },
  list_body_history: {
    description: "Every day with a reading or note in a range, newest first, its values by metric id.",
    params: [{ name: "days", schema: days_back }, { name: "today", schema: day }],
  },
} satisfies Record<string, MethodSpec>;
