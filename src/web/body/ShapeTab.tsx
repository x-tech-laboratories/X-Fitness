// The 3D tab: a body shaped to the readings on a day and the body the goals would give, side by side or one over the other, and how near the shape comes to each.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { ColorPicker, Segmented } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import { shape_roles, type BodyFit, type BodyMeasures, type BodyModel, type FitLine } from "../../shared/body/shape.ts";
import type { BodyShape } from "../../shared/body/store.ts";
import { use_data } from "../api.ts";
import { BodyViewer, create_view_link, load_body_model, type Look } from "./BodyViewer.tsx";
import { format_value, type ShownUnits } from "./format.ts";
import { today } from "./LogTab.tsx";
import type { FitAnswer, FitRequest } from "./shape_worker.ts";

// ── Fitting ──────────────────────────────────────────────────────────────────

type Shown = "side" | "now" | "goal" | "overlay";

const shown_choices: { value: Shown; label: string }[] = [
  { value: "side", label: "Side by side" },
  { value: "now", label: "Now" },
  { value: "goal", label: "Goal" },
  { value: "overlay", label: "Overlay" },
];

type LayerName = "now" | "goal";

const layer_names: Record<LayerName, string> = { now: "Now", goal: "Goal" };

const swatches = ["#2563eb", "#7c3aed", "#db2777", "#dc2626", "#f59e0b", "#16a34a", "#0891b2", "#6b7280"];

const first_looks: Record<LayerName, Look> = { now: { color: "#2563eb", opacity: 0.6 }, goal: { color: "#f59e0b", opacity: 0.6 } };

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

// The colour and opacity of one body in the overlay.
function LayerControls({ name, look, on_change }: { name: string; look: Look; on_change: (look: Look) => void }) {
  return (
    <div className="body-layer">
      <span>{name}</span>
      <ColorPicker label={`${name} colour`} value={look.color} swatches={swatches} allow_none={false} on_change={(color) => color && on_change({ ...look, color })} />
      <label className="body-layer-opacity">
        <span>Opacity</span>
        <input type="range" aria-label={`${name} opacity`} min={10} max={100} step={5} value={Math.round(look.opacity * 100)} onChange={(event) => on_change({ ...look, opacity: Number(event.currentTarget.value) / 100 })} />
      </label>
    </div>
  );
}

function ShapeView({ shape, units, on_date }: { shape: BodyShape; units: ShownUnits; on_date: (date: string) => void }) {
  const [shown, set_shown] = useState<Shown>("side");
  const [looks, set_looks] = useState(first_looks);
  const model = use_model();
  const now = use_fit(shape.measures);
  const goal = use_fit(shape.goal);
  const link = useMemo(create_view_link, []);
  const days = shape.days.includes(today()) ? shape.days : [...shape.days, today()];
  const position = Math.max(0, days.findLastIndex((day) => day <= shape.date));
  const missing = [shape.measures.height > 0 ? "" : "height", shape.measures.sex ? "" : "sex"].filter(Boolean);

  // Only the overlay is see-through; everywhere else each body is solid in its colour.
  const now_shapes = useMemo(() => [now?.parameters ?? null], [now]);
  const goal_shapes = useMemo(() => [goal?.parameters ?? null], [goal]);
  const both_shapes = useMemo(() => [now?.parameters ?? null, goal?.parameters ?? null], [now, goal]);
  const now_looks = useMemo((): Look[] => [{ color: looks.now.color, opacity: 1 }], [looks.now.color]);
  const goal_looks = useMemo((): Look[] => [{ color: looks.goal.color, opacity: 1 }], [looks.goal.color]);
  const overlay_looks = useMemo(() => [looks.now, looks.goal], [looks]);
  const label = (what: string) => `Your body ${what} on ${shape.date}`;

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
      {shown === "overlay" && (
        <div className="body-layers">
          {(Object.keys(layer_names) as LayerName[]).map((name) => (
            <LayerControls key={name} name={layer_names[name]} look={looks[name]} on_change={(look) => set_looks((current) => ({ ...current, [name]: look }))} />
          ))}
        </div>
      )}
      {missing.length > 0 && <p className="muted">{`Set your ${missing.join(" and ")} under Settings, Body, for a body true to yours.`}</p>}
      {model ? (
        <div className="body-viewers">
          {shown === "side" && (
            <>
              <div>
                <p className="muted small">Now</p>
                <BodyViewer key="side-now" model={model} shapes={now_shapes} looks={now_looks} link={link} label={label("now")} />
              </div>
              <div>
                <p className="muted small">Goal</p>
                <BodyViewer key="side-goal" model={model} shapes={goal_shapes} looks={goal_looks} link={link} label={label("at your goals")} />
              </div>
            </>
          )}
          {shown === "now" && <BodyViewer key="now" model={model} shapes={now_shapes} looks={now_looks} label={label("now")} />}
          {shown === "goal" && <BodyViewer key="goal" model={model} shapes={goal_shapes} looks={goal_looks} label={label("at your goals")} />}
          {shown === "overlay" && <BodyViewer key="overlay" model={model} shapes={both_shapes} looks={overlay_looks} label={label("with the goal body over it")} />}
        </div>
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
