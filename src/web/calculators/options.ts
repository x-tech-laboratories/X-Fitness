// The calculators' choices as Select options, shared by the Calculators page, Goals and the Body settings.

// ── Imports ──────────────────────────────────────────────────────────────────

import { activities, bmr_formulas, type Activity, type BmrFormula, type Sex } from "../../shared/calculators/formulas.ts";

// ── Options ──────────────────────────────────────────────────────────────────

export const activity_options: [Activity, string][] = activities.map((activity) => [activity.key, activity.label]);

export const bmr_formula_options: [BmrFormula, string][] = bmr_formulas.map((formula) => [formula.key, formula.label]);

export const sex_options: [Sex, string][] = [["", "Not set"], ["female", "Female"], ["male", "Male"]];
