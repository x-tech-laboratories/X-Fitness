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
  // The address of its main picture, or empty when it has none.
  image: string;
}

interface WgerExerciseInfo {
  id: number;
  category?: { name?: string };
  equipment?: { name: string }[];
  muscles?: { name: string; name_en?: string }[];
  muscles_secondary?: { name: string; name_en?: string }[];
  translations?: { language: number; name: string }[];
  images?: { image: string; is_main?: boolean }[];
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
      image: ((exercise.images ?? []).find((image) => image.is_main) ?? exercise.images?.[0])?.image ?? "",
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
  // Whether wger has a picture of it, which lookup_wger_picture fetches.
  has_picture: boolean;
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
      has_picture: exercise.image !== "",
    }));
}

// ── Pictures ─────────────────────────────────────────────────────────────────

// Bytes as base64, a chunk at a time so a large picture does not overflow the call stack.
function base64_of(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(binary);
}

// The main picture of a wger exercise as a data URL at full size, or empty when it has none; only wger's own addresses are fetched.
export async function wger_picture(wger_id: number): Promise<string> {
  const index = await load_index();
  const address = index.find((exercise) => exercise.id === wger_id)?.image ?? "";
  if (!address) return "";
  const url = new URL(address, "https://wger.de");
  if (url.hostname !== "wger.de") throw new Error(`wger gave a picture outside wger.de: ${url.hostname}`);
  const response = await fetch(url.href);
  if (!response.ok) throw new Error(`wger request failed: ${response.status} ${response.statusText}`);
  const type = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!type.startsWith("image/")) throw new Error(`wger gave ${type || "something"} rather than a picture`);
  return `data:${type};base64,${base64_of(new Uint8Array(await response.arrayBuffer()))}`;
}
