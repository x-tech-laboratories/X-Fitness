// Looking exercises up in the public wger database (https://wger.de), which needs no account or key. wger has no
// substring search, so its whole English index is fetched once, slimmed to the fields used, and searched here.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { Measurement } from "./model.ts";

// ── Index ────────────────────────────────────────────────────────────────────

const api = "https://wger.de/api/v2";

interface IndexedExercise {
  id: number;
  name: string;
  category: string;
  equipment: string[];
  muscles: string[];
}

interface WgerExerciseInfo {
  id: number;
  category?: { name?: string };
  equipment?: { name: string }[];
  muscles?: { name: string; name_en?: string }[];
  muscles_secondary?: { name: string; name_en?: string }[];
  translations?: { language: number; name: string }[];
}

async function fetch_json<Data>(url: string): Promise<Data> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`wger request failed: ${response.status} ${response.statusText}`);
  return (await response.json()) as Data;
}

async function fetch_index(): Promise<IndexedExercise[]> {
  const languages = await fetch_json<{ results?: { id: number; short_name: string }[] }>(`${api}/language/?format=json&limit=100`);
  const english = (languages.results ?? []).find((language) => language.short_name === "en");
  const exercises = await fetch_json<{ results?: WgerExerciseInfo[] }>(`${api}/exerciseinfo/?format=json&limit=999&language__code=en`);
  return (exercises.results ?? [])
    .map((exercise) => ({
      id: exercise.id,
      name: (exercise.translations ?? []).find((entry) => entry.language === english?.id)?.name ?? "",
      category: exercise.category?.name ?? "",
      equipment: (exercise.equipment ?? []).map((item) => item.name),
      muscles: [...(exercise.muscles ?? []), ...(exercise.muscles_secondary ?? [])].map((muscle) => muscle.name_en || muscle.name).filter(Boolean),
    }))
    .filter((exercise) => exercise.name);
}

// The request in flight is what is kept, so two quick searches share it; a failure is forgotten so the next search retries.
let index_promise: Promise<IndexedExercise[]> | null = null;

function load_index(): Promise<IndexedExercise[]> {
  index_promise ??= fetch_index().catch((error: unknown) => {
    index_promise = null;
    throw error;
  });
  return index_promise;
}

// Forgets the fetched index, so the next search fetches it again.
export function forget_wger_index(): void {
  index_promise = null;
}

// ── Searching ────────────────────────────────────────────────────────────────

export interface WgerResult {
  wger_id: number;
  name: string;
  measurement: Measurement;
  equipment: string;
  muscles: string[];
  category: string;
}

const bodyweight = "none (bodyweight exercise)";

// wger says nothing of how an exercise is measured: its Cardio category is cardio, needing no equipment is bodyweight reps, the rest weight and reps.
export function infer_measurement(exercise: Pick<IndexedExercise, "category" | "equipment">): Measurement {
  if (exercise.category.toLowerCase() === "cardio") return "cardio";
  if (exercise.equipment.every((item) => item === bodyweight)) return "bodyweight";
  return "weight";
}

// Names holding the text, ignoring case, earliest match first, at most 25.
export async function search_wger(term: string): Promise<WgerResult[]> {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];
  const index = await load_index();
  return index
    .map((exercise) => ({ exercise, position: exercise.name.toLowerCase().indexOf(needle) }))
    .filter(({ position }) => position >= 0)
    .sort((first, second) => first.position - second.position || first.exercise.name.localeCompare(second.exercise.name))
    .slice(0, 25)
    .map(({ exercise }) => ({
      wger_id: exercise.id,
      name: exercise.name,
      measurement: infer_measurement(exercise),
      equipment: exercise.equipment.filter((item) => item !== bodyweight).join(", "),
      muscles: exercise.muscles,
      category: exercise.category,
    }));
}
