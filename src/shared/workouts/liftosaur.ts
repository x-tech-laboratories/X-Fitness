// Liftosaur's exports (https://liftosaur.com) read into workouts: the full JSON backup ("Export data to file"), whose
// history holds every workout, or the history CSV ("Export history to CSV"), one row per set. Ids come from the data, so
// importing a newer export adds only the workouts not already there. Programs are Liftoscript and are not converted.

// ── Imports ──────────────────────────────────────────────────────────────────

import { to_stored } from "@x-tech-laboratories/x-libs/units";

import { normalize_names, type Exercise, type LoggedSet, type Workout, type WorkoutsDocument } from "./model.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

export interface LiftosaurSummary {
  exercises: number;
  workouts: number;
  sets: number;
  // Left out: warmups, and sets never performed.
  warmup_sets: number;
  incomplete_sets: number;
}

function slug(value: unknown): string {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

// "benchPress" to "Bench Press", "tBarRow" to "T Bar Row".
export function title_case(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function to_number(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

// Each weight carries its own unit, stored here in kg.
function weight_in_kg(value: unknown, unit: unknown): number {
  const number = to_number(value);
  return unit === "lb" ? to_stored(number, "lb") : number;
}

function iso_day(value: unknown): string | null {
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

interface Gathering {
  exercises: Map<string, Exercise & { bodyweight: boolean }>;
  summary: LiftosaurSummary;
}

// An exercise gathered across every set naming it; one that never carried weight comes in as bodyweight reps.
function upsert_exercise(gathering: Gathering, key: string, fields: { name: string; equipment: string; muscles: string[]; bodyweight: boolean }): string {
  const id = `lft-${slug(key)}`;
  const existing = gathering.exercises.get(id);
  gathering.exercises.set(id, {
    id,
    name: fields.name || existing?.name || "",
    measurement: "weight",
    equipment: fields.equipment || existing?.equipment || "",
    muscles: normalize_names([...(existing?.muscles ?? []), ...fields.muscles]),
    categories: [],
    notes: "",
    bodyweight: (existing?.bodyweight ?? true) && fields.bodyweight,
  });
  return id;
}

function push_set(workout: Workout, exercise_id: string, set: Omit<LoggedSet, "id">, notes: string): void {
  let entry = workout.entries.find((candidate) => candidate.exercise_id === exercise_id);
  if (!entry) {
    entry = { id: `${workout.id}-${exercise_id}`, exercise_id, session_entry_id: "", target: { sets: 0, reps: 0, weight: 0, duration: 0, distance: 0, rest: 0 }, notes, sets: [] };
    workout.entries.push(entry);
  }
  if (notes && !entry.notes) entry.notes = notes;
  entry.sets.push({ id: `${entry.id}-${entry.sets.length + 1}`, ...set });
}

function finish(gathering: Gathering, workouts: Workout[]): { document: WorkoutsDocument; summary: LiftosaurSummary } {
  const exercises = [...gathering.exercises.values()].map(({ bodyweight, ...exercise }): Exercise => ({ ...exercise, measurement: bodyweight ? "bodyweight" : "weight" }));
  return {
    document: { categories: [], exercises, programs: [], workouts },
    summary: { ...gathering.summary, exercises: exercises.length, workouts: workouts.length },
  };
}

function new_gathering(): Gathering {
  return { exercises: new Map(), summary: { exercises: 0, workouts: 0, sets: 0, warmup_sets: 0, incomplete_sets: 0 } };
}

// ── JSON backup ──────────────────────────────────────────────────────────────

interface LiftosaurWeight {
  value?: number;
  unit?: string;
}

interface LiftosaurSet {
  reps?: number;
  completedReps?: number | null;
  weight?: LiftosaurWeight;
  completedWeight?: LiftosaurWeight;
  rpe?: number;
  completedRpe?: number;
}

interface LiftosaurStorage {
  settings?: { exercises?: Record<string, { name?: string; meta?: { targetMuscles?: string[]; synergistMuscles?: string[] } }> };
  history: {
    id?: number | string;
    date?: string;
    startTime?: number;
    dayName?: string;
    programName?: string;
    entries?: { exercise?: { id?: string; equipment?: string }; notes?: string; sets?: LiftosaurSet[]; warmupSets?: unknown[] }[];
  }[];
}

function convert_storage(storage: LiftosaurStorage) {
  const gathering = new_gathering();
  const custom = storage.settings?.exercises ?? {};
  const workouts: Workout[] = [];

  for (const record of storage.history) {
    const date = iso_day(record?.date ?? record?.startTime);
    if (!date) continue;
    const workout: Workout = {
      id: `lft-${record.id ?? slug(record.date)}`,
      date,
      name: record.dayName || record.programName || "Workout",
      session_id: "",
      started_at: new Date(record.startTime || Date.parse(record.date ?? "") || 0).toISOString(),
      finished_at: "",
      notes: "",
      entries: [],
    };

    for (const entry of record.entries ?? []) {
      const exercise_key = entry?.exercise?.id;
      if (!exercise_key) continue;
      const equipment = entry.exercise?.equipment ?? "";
      const named_equipment = equipment && equipment !== "bodyweight" ? title_case(equipment) : "";
      const custom_exercise = custom[exercise_key];
      const meta = custom_exercise?.meta ?? {};
      const id = upsert_exercise(gathering, `${exercise_key}-${equipment}`, {
        name: [custom_exercise?.name || title_case(exercise_key), named_equipment].filter(Boolean).join(", "),
        equipment: named_equipment,
        muscles: [...(meta.targetMuscles ?? []), ...(meta.synergistMuscles ?? [])],
        bodyweight: equipment === "bodyweight",
      });

      gathering.summary.warmup_sets += (entry.warmupSets ?? []).length;
      for (const set of entry.sets ?? []) {
        // reps is the target and completedReps what was done, so a set without it was never performed.
        if (set.completedReps === undefined || set.completedReps === null) {
          gathering.summary.incomplete_sets += 1;
          continue;
        }
        const lifted = set.completedWeight ?? set.weight;
        const weight = weight_in_kg(lifted?.value, lifted?.unit);
        if (weight > 0) gathering.exercises.get(id)!.bodyweight = false;
        push_set(workout, id, { reps: to_number(set.completedReps), weight, duration: 0, distance: 0, rpe: to_number(set.completedRpe ?? set.rpe) }, entry.notes ?? "");
        gathering.summary.sets += 1;
      }
    }
    if (workout.entries.length > 0) workouts.push(workout);
  }
  return finish(gathering, workouts);
}

// ── History CSV ──────────────────────────────────────────────────────────────

// RFC 4180: fields may be quoted, quotes double themselves, and a quoted field may hold commas and newlines.
export function parse_csv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/\r\n/g, "\n");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char !== '"') field += char;
      else if (source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

// "Bench Press, Barbell" names the equipment after the last comma.
function equipment_of(full_name: string): string {
  const separator = full_name.lastIndexOf(", ");
  return separator < 0 ? "" : full_name.slice(separator + 2).trim();
}

function split_muscles(value: string): string[] {
  return value.split(",").map((name) => name.trim()).filter(Boolean);
}

function convert_csv(text: string) {
  const rows = parse_csv(text);
  const header = rows[0] ?? [];
  const column = (name: string) => header.indexOf(name);
  if (column("Workout DateTime") < 0 || column("Exercise") < 0) throw new Error("That CSV doesn't look like a Liftosaur history export.");
  const cell = (row: string[], name: string) => {
    const index = column(name);
    return index >= 0 ? (row[index] ?? "") : "";
  };

  const gathering = new_gathering();
  const by_time = new Map<string, Workout>();
  for (const row of rows.slice(1)) {
    const date_time = cell(row, "Workout DateTime");
    const date = iso_day(date_time);
    const full_name = cell(row, "Exercise").trim();
    if (!date || !full_name) continue;
    if (cell(row, "Is Warmup Set?") === "1") {
      gathering.summary.warmup_sets += 1;
      continue;
    }
    const completed_reps = cell(row, "Completed Reps");
    if (completed_reps === "") {
      gathering.summary.incomplete_sets += 1;
      continue;
    }

    const id = upsert_exercise(gathering, full_name, {
      name: full_name,
      equipment: equipment_of(full_name),
      muscles: [...split_muscles(cell(row, "Target Muscles")), ...split_muscles(cell(row, "Synergist Muscles"))],
      bodyweight: true,
    });
    const unit = (cell(row, "Completed Weight Unit") || cell(row, "Required Weight Unit")).trim();
    const weight = weight_in_kg(cell(row, "Completed Weight Value") || cell(row, "Required Weight Value"), unit);
    if (weight > 0) gathering.exercises.get(id)!.bodyweight = false;

    let workout = by_time.get(date_time);
    if (!workout) {
      workout = {
        id: `lft-${slug(date_time)}`,
        date,
        name: cell(row, "Day Name") || cell(row, "Program") || "Workout",
        session_id: "",
        started_at: new Date(date_time).toISOString(),
        finished_at: "",
        notes: "",
        entries: [],
      };
      by_time.set(date_time, workout);
    }
    push_set(workout, id, { reps: to_number(completed_reps), weight, duration: 0, distance: 0, rpe: to_number(cell(row, "Completed RPE") || cell(row, "Required RPE")) }, cell(row, "Notes"));
    gathering.summary.sets += 1;
  }
  return finish(gathering, [...by_time.values()]);
}

// ── Either file ──────────────────────────────────────────────────────────────

// Throws with something the user can act on when the file is neither export.
export function read_liftosaur_export(text: string): { document: WorkoutsDocument; summary: LiftosaurSummary } {
  const content = text.trim();
  if (!content) throw new Error("The file is empty.");
  if (content.startsWith("{")) {
    let storage: unknown;
    try {
      storage = JSON.parse(content);
    } catch {
      throw new Error("That file starts like JSON but isn't valid JSON.");
    }
    if (!Array.isArray((storage as Partial<LiftosaurStorage> | null)?.history)) throw new Error('That JSON has no history; export with Liftosaur\'s "Export data to file".');
    return convert_storage(storage as LiftosaurStorage);
  }
  return convert_csv(content);
}
