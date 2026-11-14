// The body calls described for other programs: what each does and the arguments it takes.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { MethodSpec } from "@x-tech-laboratories/x-libs/api_spec";

import { day, id_of, number, step, text } from "../api_schemas.ts";
import { metric_roles } from "./readings.ts";

// ── Calls ────────────────────────────────────────────────────────────────────

const days_back = { type: "integer", minimum: 0, description: "How many days back from today; 0 for all time." };

export const body_api = {
  list_body_metrics: {
    description: "Lists the body metrics, such as weight or waist, in order, with how many readings each has and the last day read.",
    params: [],
  },
  save_body_metric: {
    description: "Adds a body metric, or changes the one with the id given. Gives back its id.",
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
            goal: number("The goal in the stored unit; 0 for none."),
            comment: text("A note on the metric."),
            role: {
              type: "string",
              enum: metric_roles.map((role) => role.key),
              description:
                "What the metric stands for: body_fat for a percent metric; a girth, which also shapes the 3D body, or a caliper skinfold such as skinfold_thigh for a length metric; resting_heart_rate for a custom metric in bpm; empty for nothing. The calculators read their measures by role.",
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
    description: "One day's readings for every metric, each with the reading before it, the day's note, and BMI from the latest weight.",
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
    description: "One metric's readings over a range, with a moving average, statistics, how far is left to the goal, and BMI for the weight metric.",
    params: [{ name: "metric_id", schema: id_of("metric") }, { name: "days", schema: days_back }, { name: "today", schema: day }],
  },
  get_body_shape: {
    description:
      "What the 3D body is drawn from on a day: the sex and height from Settings, the latest weight, body fat and girths by role on or before the day in kg, percent and cm, the same at the goals, and every day with such a reading.",
    params: [{ name: "date", schema: day }],
  },
  list_body_history: {
    description: "Every day with a reading or note in a range, newest first, its values by metric id.",
    params: [{ name: "days", schema: days_back }, { name: "today", schema: day }],
  },
} satisfies Record<string, MethodSpec>;
