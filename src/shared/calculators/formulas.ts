// The fitness formulas, from body measures to BMI, body fat, lean mass, energy and the daily targets a plan gives. Plain
// functions on kg, cm, years and kcal, so the store, the page and other programs all work them out the same way.

// ── Measures ─────────────────────────────────────────────────────────────────

export type Sex = "" | "female" | "male";

export type Skinfold = "chest" | "abdomen" | "thigh" | "triceps" | "suprailiac" | "midaxillary" | "subscapular";

export const skinfolds: { key: Skinfold; label: string }[] = [
  { key: "chest", label: "Chest" },
  { key: "abdomen", label: "Belly" },
  { key: "thigh", label: "Thigh" },
  { key: "triceps", label: "Back of arm" },
  { key: "suprailiac", label: "Above hip" },
  { key: "midaxillary", label: "Side of ribs" },
  { key: "subscapular", label: "Shoulder blade" },
];

export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";

export const activities: { key: Activity; label: string; factor: number }[] = [
  { key: "sedentary", label: "Sedentary: little or no exercise", factor: 1.2 },
  { key: "light", label: "Light: exercise 1–3 days a week", factor: 1.375 },
  { key: "moderate", label: "Moderate: exercise 3–5 days a week", factor: 1.55 },
  { key: "active", label: "Active: hard exercise 6–7 days a week", factor: 1.725 },
  { key: "very_active", label: "Very active: physical job or training twice a day", factor: 1.9 },
];

export type BmrFormula = "mifflin_st_jeor" | "harris_benedict" | "katch_mcardle";

export const bmr_formulas: { key: BmrFormula; label: string }[] = [
  { key: "mifflin_st_jeor", label: "Mifflin-St Jeor" },
  { key: "harris_benedict", label: "Harris-Benedict" },
  { key: "katch_mcardle", label: "Katch-McArdle (needs body fat)" },
];

// What the calculators work from, 0 where a measure is missing; weights in kg, lengths and skinfolds in cm.
export interface Measures {
  sex: Sex;
  age: number;
  height: number;
  weight: number;
  body_fat: number;
  neck: number;
  waist: number;
  hips: number;
  skinfolds: Partial<Record<Skinfold, number>>;
  activity: Activity;
  bmr_formula: BmrFormula;
}

export function sex_of(raw: unknown): Sex {
  return raw === "female" || raw === "male" ? raw : "";
}

export function activity_of(raw: unknown): Activity {
  return activities.find((activity) => activity.key === raw)?.key ?? "light";
}

export function bmr_formula_of(raw: unknown): BmrFormula {
  return bmr_formulas.find((formula) => formula.key === raw)?.key ?? "mifflin_st_jeor";
}

// Whole years from a birth date to today, or 0 when the birth date is missing or later.
export function age_on(birth_date: string, today: string): number {
  const born = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth_date);
  const now = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!born || !now) return 0;
  const before_birthday = now[2]! + now[3]! < born[2]! + born[3]!;
  return Math.max(0, Number(now[1]) - Number(born[1]) - (before_birthday ? 1 : 0));
}

// ── BMI ──────────────────────────────────────────────────────────────────────

export const healthy_bmi = { low: 18.5, high: 24.9 };

export function body_mass_index(weight: number, height: number): number | null {
  if (!(weight > 0) || !(height > 0)) return null;
  return weight / (height / 100) ** 2;
}

// The weight a BMI gives at a height.
export function weight_at_bmi(bmi: number, height: number): number | null {
  if (!(bmi > 0) || !(height > 0)) return null;
  return bmi * (height / 100) ** 2;
}

export function bmi_category(bmi: number): string {
  if (bmi < healthy_bmi.low) return "Underweight";
  if (bmi < 25) return "Healthy weight";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

// ── Body fat ─────────────────────────────────────────────────────────────────

// Body fat percent from body density, by Siri's equation.
function siri(density: number): number {
  return 495 / density - 450;
}

// A percent outside what a body could be means the measures were wrong, so it is left out.
function plausible(percent: number): number | null {
  return Number.isFinite(percent) && percent > 0 && percent < 75 ? percent : null;
}

// The US Navy tape method from neck, waist, height and, for women, hips; a sex must be set.
export function navy_body_fat(measures: Pick<Measures, "sex" | "height" | "neck" | "waist" | "hips">): number | null {
  const { sex, height, neck, waist, hips } = measures;
  if (!(height > 0) || !(neck > 0) || !(waist > 0)) return null;
  if (sex === "male" && waist > neck) return plausible(495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450);
  if (sex === "female" && hips > 0 && waist + hips > neck) {
    return plausible(495 / (1.29579 - 0.35004 * Math.log10(waist + hips - neck) + 0.221 * Math.log10(height)) - 450);
  }
  return null;
}

export type CaliperMethod = "jackson_pollock_3" | "jackson_pollock_7";

// The skinfolds each method pinches: three for men and women apiece, or the same seven for both.
export function caliper_sites(method: CaliperMethod, sex: Sex): Skinfold[] {
  if (method === "jackson_pollock_7") return ["chest", "midaxillary", "triceps", "subscapular", "abdomen", "suprailiac", "thigh"];
  if (sex === "female") return ["triceps", "suprailiac", "thigh"];
  return ["chest", "abdomen", "thigh"];
}

// Jackson-Pollock skinfold body fat; every site the method needs, a sex and an age must be given.
export function caliper_body_fat(method: CaliperMethod, measures: Pick<Measures, "sex" | "age" | "skinfolds">): number | null {
  const { sex, age, skinfolds: folds } = measures;
  if (!sex || !(age > 0)) return null;
  const sites = caliper_sites(method, sex).map((site) => folds[site] ?? 0);
  if (sites.some((site) => !(site > 0))) return null;
  // The equations take millimetres.
  const sum = sites.reduce((total, site) => total + site * 10, 0);
  const coefficients =
    method === "jackson_pollock_3"
      ? sex === "male" ? [1.10938, 0.0008267, 0.0000016, 0.0002574] : [1.0994921, 0.0009929, 0.0000023, 0.0001392]
      : sex === "male" ? [1.112, 0.00043499, 0.00000055, 0.00028826] : [1.097, 0.00046971, 0.00000056, 0.00012828];
  const [base, linear, square, per_year] = coefficients as [number, number, number, number];
  return plausible(siri(base - linear * sum + square * sum * sum - per_year * age));
}

// Deurenberg's estimate from BMI, age and sex, rougher than a tape or calipers.
export function bmi_body_fat(bmi: number | null, age: number, sex: Sex): number | null {
  if (bmi === null || !sex || !(age > 0)) return null;
  return plausible(1.2 * bmi + 0.23 * age - 10.8 * (sex === "male" ? 1 : 0) - 5.4);
}

// ── Composition ──────────────────────────────────────────────────────────────

export interface Composition {
  lean_mass: number;
  fat_mass: number;
  // Fat-free mass index, and the same scaled to a height of 1.8 m.
  ffmi: number | null;
  normalized_ffmi: number | null;
}

export function composition(weight: number, body_fat: number, height: number): Composition | null {
  if (!(weight > 0) || !(body_fat > 0) || body_fat >= 100) return null;
  const fat_mass = (weight * body_fat) / 100;
  const lean_mass = weight - fat_mass;
  const metres = height / 100;
  const ffmi = height > 0 ? lean_mass / (metres * metres) : null;
  return { lean_mass, fat_mass, ffmi, normalized_ffmi: ffmi === null ? null : ffmi + 6.1 * (1.8 - metres) };
}

// The weight that keeps today's lean mass at another body fat percent.
export function weight_at_body_fat(lean_mass: number, body_fat: number): number | null {
  if (!(lean_mass > 0) || !(body_fat > 0) || body_fat >= 100) return null;
  return lean_mass / (1 - body_fat / 100);
}

export function ratio(part: number, whole: number): number | null {
  return part > 0 && whole > 0 ? part / whole : null;
}

// A waist under half the height is the usual sign of a healthy amount of belly fat.
export function waist_to_height_category(value: number): string {
  if (value < 0.4) return "Slim";
  if (value < 0.5) return "Healthy";
  if (value < 0.6) return "Raised risk";
  return "High risk";
}

// The WHO's waist-to-hip cut-offs, 0.85 for women and 0.9 for men.
export function waist_to_hip_category(value: number, sex: Sex): string {
  const limit = sex === "female" ? 0.85 : sex === "male" ? 0.9 : 0.875;
  return value < limit ? "Healthy" : "Raised risk";
}

// ── Energy ───────────────────────────────────────────────────────────────────

export const kcal_per_kg_of_fat = 7700;

// Basal metabolic rate in kcal a day by each formula, null where a measure it needs is missing; no sex averages the two.
export function basal_rates(measures: Pick<Measures, "sex" | "age" | "height" | "weight" | "body_fat">): Record<BmrFormula, number | null> {
  const { sex, age, height, weight, body_fat } = measures;
  const by_sex = (female: number, male: number) => (sex === "female" ? female : sex === "male" ? male : (female + male) / 2);
  const whole = weight > 0 && height > 0 && age > 0;
  const lean = composition(weight, body_fat, height)?.lean_mass ?? 0;
  return {
    mifflin_st_jeor: whole ? 10 * weight + 6.25 * height - 5 * age + by_sex(-161, 5) : null,
    harris_benedict: whole ? by_sex(447.593 + 9.247 * weight + 3.098 * height - 4.33 * age, 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age) : null,
    katch_mcardle: lean > 0 ? 370 + 21.6 * lean : null,
  };
}

export function activity_factor(activity: Activity): number {
  return activities.find((candidate) => candidate.key === activity)?.factor ?? 1.2;
}

// ── Everything ───────────────────────────────────────────────────────────────

export type BodyFatSource = "reading" | "navy" | "jackson_pollock_7" | "jackson_pollock_3" | "bmi";

// About 35 ml of water a day for each kg of body weight, before exercise and heat.
export function daily_water(weight: number): number | null {
  return weight > 0 ? (weight * 35) / 1000 : null;
}

export interface Calculations {
  bmi: number | null;
  bmi_category: string | null;
  // The weights a healthy BMI spans at this height.
  healthy_weight: { low: number; high: number } | null;
  navy_body_fat: number | null;
  jackson_pollock_3: number | null;
  jackson_pollock_7: number | null;
  bmi_body_fat: number | null;
  // The body fat the rest is worked out from: the reading, else the first method that gives one.
  body_fat: number | null;
  body_fat_source: BodyFatSource | null;
  composition: Composition | null;
  waist_to_height: number | null;
  waist_to_hip: number | null;
  basal_rates: Record<BmrFormula, number | null>;
  // The chosen formula's basal rate, falling back to Mifflin-St Jeor when it lacks a measure.
  bmr: number | null;
  bmr_formula: BmrFormula | null;
  // Total daily energy expenditure: the basal rate times the activity.
  tdee: number | null;
  // Litres a day.
  water: number | null;
}

export function calculate(measures: Measures): Calculations {
  const bmi = body_mass_index(measures.weight, measures.height);
  const low = weight_at_bmi(healthy_bmi.low, measures.height);
  const high = weight_at_bmi(healthy_bmi.high, measures.height);
  const navy = navy_body_fat(measures);
  const jackson_pollock_3 = caliper_body_fat("jackson_pollock_3", measures);
  const jackson_pollock_7 = caliper_body_fat("jackson_pollock_7", measures);
  const candidates: [BodyFatSource, number | null][] = [
    ["reading", measures.body_fat > 0 ? measures.body_fat : null],
    ["navy", navy],
    ["jackson_pollock_7", jackson_pollock_7],
    ["jackson_pollock_3", jackson_pollock_3],
    ["bmi", bmi_body_fat(bmi, measures.age, measures.sex)],
  ];
  const [body_fat_source, body_fat] = candidates.find(([, value]) => value !== null) ?? [null, null];
  const rates = basal_rates({ ...measures, body_fat: body_fat ?? 0 });
  const bmr_formula = rates[measures.bmr_formula] !== null ? measures.bmr_formula : rates.mifflin_st_jeor !== null ? "mifflin_st_jeor" : null;
  const bmr = bmr_formula ? rates[bmr_formula] : null;
  return {
    bmi,
    bmi_category: bmi === null ? null : bmi_category(bmi),
    healthy_weight: low !== null && high !== null ? { low, high } : null,
    navy_body_fat: navy,
    jackson_pollock_3,
    jackson_pollock_7,
    bmi_body_fat: bmi_body_fat(bmi, measures.age, measures.sex),
    body_fat,
    body_fat_source,
    composition: body_fat === null ? null : composition(measures.weight, body_fat, measures.height),
    waist_to_height: ratio(measures.waist, measures.height),
    waist_to_hip: ratio(measures.waist, measures.hips),
    basal_rates: rates,
    bmr,
    bmr_formula,
    tdee: bmr === null ? null : bmr * activity_factor(measures.activity),
    water: daily_water(measures.weight),
  };
}

// ── Missing measures ─────────────────────────────────────────────────────────

// A measure a result is worked out from: the sex, age, height, a reading or a skinfold.
export type Need = "sex" | "age" | "height" | "weight" | "body_fat" | "neck" | "waist" | "hips" | Skinfold;

function has_need(need: Need, measures: Measures): boolean {
  if (need === "sex") return measures.sex !== "";
  if (need === "age" || need === "height" || need === "weight" || need === "body_fat" || need === "neck" || need === "waist" || need === "hips") return measures[need] > 0;
  return (measures.skinfolds[need] ?? 0) > 0;
}

// The needs given that the measures lack, in the order given.
export function missing_needs(needs: Need[], measures: Measures): Need[] {
  return needs.filter((need) => !has_need(need, measures));
}

// What each body fat method is worked out from; without a sex the calipers ask for the men's three sites.
export function body_fat_needs(method: BodyFatSource, sex: Sex): Need[] {
  if (method === "reading") return ["body_fat"];
  if (method === "navy") return sex === "female" ? ["sex", "height", "neck", "waist", "hips"] : ["sex", "height", "neck", "waist"];
  if (method === "bmi") return ["sex", "age", "weight", "height"];
  return ["sex", "age", ...caliper_sites(method, sex)];
}

// ── Diet plan ────────────────────────────────────────────────────────────────

// How the plan reaches the goal weight and what it eats on the way.
export interface GoalPlan {
  // Kilograms a week, below 0 to lose.
  weekly_change: number;
  protein_per_kg: number;
  // The share of the day's energy from fat, in percent.
  fat_percent: number;
}

export type GoalKey = "calories" | "protein" | "fat" | "carbs";

export const diet_goal_keys: GoalKey[] = ["calories", "protein", "fat", "carbs"];

export interface PlannedGoal {
  key: GoalKey;
  // In kcal or grams; null when the measures it needs are missing.
  value: number | null;
  // How it was worked out, or what is missing.
  basis: string;
}

export function round_to(value: number, step: number): number {
  const per_unit = 1 / step;
  return Math.round(value * per_unit) / per_unit;
}

// The energy a day above or below what is burned that a weekly change of weight takes, in kcal.
export function daily_energy_change(weekly_change: number): number {
  return (weekly_change * kcal_per_kg_of_fat) / 7;
}

// The daily targets the plan gives, rounded as a target is set by hand; a measured daily energy replaces the formula's.
export function plan_goals(measures: Measures, calculations: Calculations, plan: GoalPlan, measured_tdee: number | null = null): PlannedGoal[] {
  const tdee = measured_tdee ?? calculations.tdee;
  if (tdee === null || !(measures.weight > 0)) {
    const basis = "Needs a weight, a height and a birth date for the daily energy";
    return diet_goal_keys.map((key) => ({ key, value: null, basis }));
  }
  const calories = round_to(tdee + daily_energy_change(plan.weekly_change), 10);
  const protein = round_to(plan.protein_per_kg * measures.weight, 1);
  const fat = round_to((calories * plan.fat_percent) / 100 / 9, 1);
  const carbs = Math.max(0, round_to((calories - protein * 4 - fat * 9) / 4, 1));
  const change = plan.weekly_change === 0 ? "to keep your weight" : `to ${plan.weekly_change < 0 ? "lose" : "gain"} at the planned rate`;
  return [
    { key: "calories", value: calories, basis: `The energy ${measured_tdee !== null ? "your log shows you burn" : "you burn"} a day, ${change}` },
    { key: "protein", value: protein, basis: `${plan.protein_per_kg} g per kg of body weight` },
    { key: "fat", value: fat, basis: `${plan.fat_percent}% of the calories` },
    { key: "carbs", value: carbs, basis: "The calories left after protein and fat" },
  ];
}

// ── Trends ───────────────────────────────────────────────────────────────────

export interface DatedValue {
  date: string;
  value: number;
}

function day_number(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}

// The least-squares change a day through dated readings, or null without two readings a week apart.
export function change_per_day(points: DatedValue[]): number | null {
  if (points.length < 2) return null;
  const days = points.map((point) => day_number(point.date));
  if (Math.max(...days) - Math.min(...days) < 7) return null;
  const mean_day = days.reduce((sum, day) => sum + day, 0) / days.length;
  const mean_value = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  let covariance = 0;
  let variance = 0;
  points.forEach((point, index) => {
    covariance += (days[index]! - mean_day) * (point.value - mean_value);
    variance += (days[index]! - mean_day) ** 2;
  });
  return covariance / variance;
}

export const least_logged_days = 7;

export interface MeasuredEnergy {
  days_logged: number;
  average_intake: number;
  // Kilograms a week by the weight trend.
  weekly_change: number;
  // What was eaten a day less the energy stored or more the energy drawn from the body.
  tdee: number;
}

// The energy burned a day as the diary and the scales show it: what was eaten, less what the weight trend says was stored.
export function measured_energy(intake: { date: string; calories: number; entries: number }[], weights: DatedValue[]): MeasuredEnergy | null {
  const logged = intake.filter((day) => day.entries > 0);
  const per_day = change_per_day(weights);
  if (logged.length < least_logged_days || per_day === null) return null;
  const average_intake = logged.reduce((sum, day) => sum + day.calories, 0) / logged.length;
  return { days_logged: logged.length, average_intake, weekly_change: per_day * 7, tdee: average_intake - per_day * kcal_per_kg_of_fat };
}

export interface GoalProgress {
  weight: number;
  goal: number;
  // Kilograms a week by the weight trend, null without enough readings.
  trend_weekly_change: number | null;
  // Weeks to the goal at the trend's pace, null when it is flat or heads away.
  trend_weeks: number | null;
  plan_weeks: number | null;
}

export function goal_progress(weight: number, goal: number, trend_weekly_change: number | null, plan_weekly_change: number): GoalProgress | null {
  if (!(weight > 0) || !(goal > 0)) return null;
  const to_go = goal - weight;
  const weeks_at = (pace: number | null) => (pace !== null && pace !== 0 && Math.sign(pace) === Math.sign(to_go) ? to_go / pace : null);
  return {
    weight,
    goal,
    trend_weekly_change,
    trend_weeks: to_go === 0 ? 0 : weeks_at(trend_weekly_change),
    plan_weeks: to_go === 0 ? 0 : weeks_at(plan_weekly_change),
  };
}
