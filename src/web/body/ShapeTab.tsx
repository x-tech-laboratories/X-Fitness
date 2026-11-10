// The 3D tab: a body shaped to the readings on a day, the body the goals would give, and how near the shape comes to each.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { Segmented } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import { shape_roles, type BodyFit, type BodyMeasures, type BodyModel, type FitLine } from "../../shared/body/shape.ts";
import type { BodyShape } from "../../shared/body/store.ts";
import { use_data } from "../api.ts";
import { BodyViewer, load_body_model } from "./BodyViewer.tsx";
import { format_value, type ShownUnits } from "./format.ts";
import { today } from "./LogTab.tsx";
import type { FitAnswer, FitRequest } from "./shape_worker.ts";

// ── Fitting ──────────────────────────────────────────────────────────────────

type Shown = "now" | "goal" | "both";

const shown_choices: { value: Shown; label: string }[] = [
  { value: "now", label: "Now" },
  { value: "goal", label: "Goal" },
  { value: "both", label: "Both" },
];

// Fits each set of measures in a worker, giving null until its answer comes; a newer set wins over an older one.
function use_fit(measures: BodyMeasures | null): BodyFit | null {
  const worker = useRef<Worker | null>(null);
  const latest = useRef(0);
  const [fit, set_fit] = useState<BodyFit | null>(null);

  useEffect(() => {
    const started = new Worker(new URL("./shape_worker.ts", import.meta.url), { type: "module" });
    worker.current = started;
    started.onmessage = (event: MessageEvent<FitAnswer>) => {
      if (event.data.id === latest.current) set_fit(event.data.fit);
    };
    return () => started.terminate();
  }, []);

  const key = JSON.stringify(measures);
  useEffect(() => {
    if (!measures || !worker.current) return set_fit(null);
    latest.current += 1;
    worker.current.postMessage({ id: latest.current, measures } satisfies FitRequest);
    // The key stands for the measures, which come as a new object on every load.
  }, [key]);

  return fit;
}

function use_model(): BodyModel | null {
  const [model, set_model] = useState<BodyModel | null>(null);
  useEffect(() => {
    let live = true;
    void load_body_model().then((loaded) => live && set_model(loaded));
    return () => void (live = false);
  }, []);
  return model;
}

// ── Readings ─────────────────────────────────────────────────────────────────

interface FitRow extends FitLine {
  goal: number | null;
  units: ShownUnits;
}

function line_label(name: FitLine["name"]): string {
  if (name === "height") return "Height";
  if (name === "mass") return "Weight";
  return shape_roles.find((role) => role.key === name)?.label ?? name;
}

function format_line(name: FitLine["name"], value: number, units: ShownUnits): string {
  return format_value({ kind: name === "mass" ? "weight" : "length", unit: "" }, value, units);
}

const fit_columns: TableColumn<FitRow>[] = [
  { label: "Reading", cell: (row) => line_label(row.name) },
  { label: "Measured", cell: (row) => format_line(row.name, row.wanted, row.units) },
  { label: "On the model", cell: (row) => format_line(row.name, row.reached, row.units) },
  { label: "Goal", cell: (row) => (row.goal !== null ? format_line(row.name, row.goal, row.units) : "—") },
];

// The goal of each line the body was fitted to, when it differs from the reading.
function goal_of(line: FitLine, goal: BodyFit | null): number | null {
  const reached = goal?.lines.find((candidate) => candidate.name === line.name);
  return reached && Math.abs(reached.wanted - line.wanted) > 0.05 ? reached.wanted : null;
}

// ── View ─────────────────────────────────────────────────────────────────────

function ShapeView({ shape, units, on_date }: { shape: BodyShape; units: ShownUnits; on_date: (date: string) => void }) {
  const [shown, set_shown] = useState<Shown>("now");
  const model = use_model();
  const now = use_fit(shape.measures);
  const goal = use_fit(shape.goal);
  const days = shape.days.includes(today()) ? shape.days : [...shape.days, today()];
  const position = Math.max(0, days.findLastIndex((day) => day <= shape.date));
  const missing = [shape.measures.height > 0 ? "" : "height", shape.measures.sex ? "" : "sex"].filter(Boolean);

  return (
    <div className="stack">
      <Toolbar>
        <Segmented label="Show" choices={shown_choices} value={shown} on_change={set_shown} />
        {days.length > 1 && (
          <label className="body-shape-day">
            <span>{shape.date}</span>
            <input type="range" aria-label="Day" min={0} max={days.length - 1} step={1} value={position} onChange={(event) => on_date(days[Number(event.currentTarget.value)]!)} />
          </label>
        )}
      </Toolbar>
      {missing.length > 0 && <p className="muted">{`Set your ${missing.join(" and ")} under Settings, Body, for a body true to yours.`}</p>}
      {model ? (
        <BodyViewer
          model={model}
          body={shown === "goal" ? (goal?.parameters ?? null) : (now?.parameters ?? null)}
          goal={shown === "both" ? (goal?.parameters ?? null) : null}
          label={`Your body on ${shape.date}${shown === "both" ? ", with the goal body outlined" : shown === "goal" ? " at your goals" : ""}`}
        />
      ) : (
        <p className="muted">Loading the body…</p>
      )}
      {now && now.lines.length > 0 ? (
        <DataTable caption="Readings the body is shaped to" columns={fit_columns} rows={now.lines.map((line) => ({ ...line, goal: goal_of(line, goal), units }))} row_key={(row) => row.name} />
      ) : (
        <p className="muted">No readings shape the body yet. Log weight, body fat or girths, and pick what each metric shapes under Metrics.</p>
      )}
    </div>
  );
}

export function ShapeTab({ units }: { units: ShownUnits }) {
  const [date, set_date] = useState(today);
  const shape = use_data((api) => api.get_body_shape(date), [date]);

  return <Loaded resource={shape}>{(loaded) => <ShapeView shape={loaded} units={units} on_date={set_date} />}</Loaded>;
}
