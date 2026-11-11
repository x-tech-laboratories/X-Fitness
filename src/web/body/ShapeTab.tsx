// The 3D tab: a body shaped to the readings on a day beside the body the goals would give or the body on another day, side by side or one over the other, shaded by where they differ, played day by day, and how near the shape comes to each.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { ColorPicker, Segmented, Switch } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";

import { body_setting_defaults } from "../../shared/body/settings.ts";
import { shape_roles, type BodyFit, type BodyMeasures, type BodyModel, type FitLine } from "../../shared/body/shape.ts";
import type { BodyShape } from "../../shared/body/store.ts";
import { calls, use_data } from "../api.ts";
import { BodyViewer, create_view_link, load_body_model, type Look } from "./BodyViewer.tsx";
import { format_value, type ShownUnits } from "./format.ts";
import { today } from "./LogTab.tsx";
import type { FitAnswer, FitRequest } from "./shape_worker.ts";

// ── Fitting ──────────────────────────────────────────────────────────────────

type Shown = "side" | "now" | "other" | "overlay";

type Compared = "goal" | "day";

const compared_choices: { value: Compared; label: string }[] = [
  { value: "goal", label: "Goal" },
  { value: "day", label: "Another day" },
];

type LayerName = "now" | "goal" | "day";

type Looks = Record<LayerName, Look>;

const swatches = ["#2563eb", "#7c3aed", "#db2777", "#dc2626", "#f59e0b", "#16a34a", "#0891b2", "#6b7280"];

const looks_key = "body.shape_looks";

// A dragged slider saves once it rests this long.
const save_delay = 400;

// Playing shows each day this long once it has loaded.
const play_step = 800;

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
  other: number | null;
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

// The last column holds the body compared with, headed by its name.
function fit_columns(other: string): TableColumn<FitRow>[] {
  return [
    { label: "Reading", cell: (row) => line_label(row.name) },
    { label: "Measured", cell: (row) => format_line(row.name, row.wanted, row.units) },
    { label: "On the model", cell: (row) => format_line(row.name, row.reached, row.units) },
    { label: other, cell: (row) => (row.other !== null ? format_line(row.name, row.other, row.units) : "—") },
  ];
}

// What the compared body was fitted to for each line, when it differs from the reading.
function other_of(line: FitLine, other: BodyFit | null): number | null {
  const reached = other?.lines.find((candidate) => candidate.name === line.name);
  return reached && Math.abs(reached.wanted - line.wanted) > 0.05 ? reached.wanted : null;
}

// ── Looks ────────────────────────────────────────────────────────────────────

// The saved looks laid over the first ones, so a layer missing or broken in the setting keeps its first look.
function looks_of(saved: unknown): Looks {
  const first = body_setting_defaults[looks_key];
  const given = (saved && typeof saved === "object" ? saved : {}) as Partial<Record<LayerName, Partial<Look>>>;
  const look_of = (name: LayerName): Look => {
    const { color, opacity } = given[name] ?? {};
    return {
      color: typeof color === "string" && color ? color : first[name].color,
      opacity: typeof opacity === "number" && opacity > 0 && opacity <= 1 ? opacity : first[name].opacity,
    };
  };
  return { now: look_of("now"), goal: look_of("goal"), day: look_of("day") };
}

// Each layer's look, following the setting and saving to it a moment after the last change so a dragged slider writes once.
function use_looks(saved: unknown): [Looks, (name: LayerName, look: Look) => void] {
  const [looks, set_looks] = useState(() => looks_of(saved));
  const latest = useRef(looks);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saved_key = JSON.stringify(saved ?? null);
  useEffect(() => {
    if (pending.current) return;
    latest.current = looks_of(saved);
    set_looks(latest.current);
    // The key stands for the setting, which comes as a new object on every load.
  }, [saved_key]);

  // Leaving the tab saves a change still waiting.
  useEffect(
    () => () => {
      if (!pending.current) return;
      clearTimeout(pending.current);
      void calls().set_setting(looks_key, latest.current);
    },
    [],
  );

  function change(name: LayerName, look: Look): void {
    latest.current = { ...latest.current, [name]: look };
    set_looks(latest.current);
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      pending.current = null;
      void calls().set_setting(looks_key, latest.current);
    }, save_delay);
  }

  return [looks, change];
}

// ── View ─────────────────────────────────────────────────────────────────────

// Every day with a reading, and today.
function days_of(shape: BodyShape): string[] {
  return shape.days.includes(today()) ? shape.days : [...shape.days, today()];
}

// The last day a month or more before the shown one, or the first day when none is that old.
function month_before(days: string[], date: string): string {
  const back = new Date(`${date}T00:00:00Z`);
  back.setUTCMonth(back.getUTCMonth() - 1);
  const limit = back.toISOString().slice(0, 10);
  return days.findLast((day) => day <= limit) ?? days[0] ?? date;
}

// A slider over the days with readings, naming the day it is on.
function DaySlider({ label, days, date, on_date }: { label: string; days: string[]; date: string; on_date: (date: string) => void }) {
  const position = Math.max(0, days.findLastIndex((day) => day <= date));
  return (
    <label className="body-shape-day">
      <span>{date}</span>
      <input type="range" aria-label={label} min={0} max={days.length - 1} step={1} value={position} onChange={(event) => on_date(days[Number(event.currentTarget.value)]!)} />
    </label>
  );
}

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

interface ShapeViewProps {
  shape: BodyShape;
  units: ShownUnits;
  saved_looks: unknown;
  playing: boolean;
  on_date: (date: string) => void;
  on_play: () => void;
}

function ShapeView({ shape, units, saved_looks, playing, on_date, on_play }: ShapeViewProps) {
  const [shown, set_shown] = useState<Shown>("side");
  const [compared, set_compared] = useState<Compared>("goal");
  const [then_date, set_then_date] = useState<string | null>(null);
  const [shaded, set_shaded] = useState(false);
  const [looks, set_look] = use_looks(saved_looks);
  const model = use_model();
  const link = useMemo(create_view_link, []);
  const days = days_of(shape);
  const then_day = then_date ?? month_before(days, shape.date);
  const then_shape = use_data((api) => (compared === "day" ? api.get_body_shape(then_day) : Promise.resolve(null)), [compared, then_day]);
  // The compared day stays drawn while the next one loads.
  const then_last = useRef<BodyShape | null>(null);
  if (then_shape.data) then_last.current = then_shape.data;
  const now = use_fit(shape.measures);
  const other = use_fit(compared === "day" ? (then_last.current?.measures ?? null) : shape.goal);
  const missing = [shape.measures.height > 0 ? "" : "height", shape.measures.sex ? "" : "sex"].filter(Boolean);

  // The second body is the goal body or the body on the compared day, each with its own look.
  const other_layer: LayerName = compared === "day" ? "day" : "goal";
  const other_name = compared === "day" ? then_day : "Goal";
  const now_label = `Your body now on ${shape.date}`;
  const other_label = compared === "day" ? `Your body on ${then_day}` : `Your body at your goals on ${shape.date}`;
  const overlay_label = `${now_label} with ${compared === "day" ? `the body on ${then_day}` : "the goal body"} over it`;
  const shading = shaded && (shown === "side" || shown === "now");
  const change_from = shading ? (other?.parameters ?? null) : null;
  const shown_choices: { value: Shown; label: string }[] = [
    { value: "side", label: "Side by side" },
    { value: "now", label: "Now" },
    { value: "other", label: other_name },
    { value: "overlay", label: "Overlay" },
  ];

  // Only the overlay is see-through; everywhere else each body is solid in its colour.
  const now_shapes = useMemo(() => [now?.parameters ?? null], [now]);
  const other_shapes = useMemo(() => [other?.parameters ?? null], [other]);
  const both_shapes = useMemo(() => [now?.parameters ?? null, other?.parameters ?? null], [now, other]);
  const now_looks = useMemo((): Look[] => [{ color: looks.now.color, opacity: 1 }], [looks.now.color]);
  const other_looks = useMemo((): Look[] => [{ color: looks[other_layer].color, opacity: 1 }], [looks, other_layer]);
  const overlay_looks = useMemo(() => [looks.now, looks[other_layer]], [looks, other_layer]);
  const columns = useMemo(() => fit_columns(other_name), [other_name]);

  return (
    <div className="stack">
      <Toolbar>
        <Segmented label="Show" choices={shown_choices} value={shown} on_change={set_shown} />
        {days.length > 1 && <DaySlider label="Day" days={days} date={shape.date} on_date={on_date} />}
        {days.length > 1 && (
          <button type="button" onClick={on_play}>
            {playing ? "Pause" : "Play"}
          </button>
        )}
        {(shown === "side" || shown === "now") && (
          <label className="body-shape-shade">
            <Switch label="Shade the change" checked={shaded} on_change={set_shaded} />
            <span>Shade the change</span>
          </label>
        )}
      </Toolbar>
      {days.length > 1 && (
        <Toolbar>
          <Segmented label="Compare with" choices={compared_choices} value={compared} on_change={set_compared} />
          {compared === "day" && <DaySlider label="Compared day" days={days} date={then_day} on_date={set_then_date} />}
        </Toolbar>
      )}
      {shown === "overlay" && (
        <div className="body-layers">
          <LayerControls name="Now" look={looks.now} on_change={(look) => set_look("now", look)} />
          <LayerControls name={other_name} look={looks[other_layer]} on_change={(look) => set_look(other_layer, look)} />
        </div>
      )}
      {shading && <p className="muted small">{`Red where the body now is larger than ${compared === "day" ? `on ${then_day}` : "at the goals"}, teal where it is smaller.`}</p>}
      {missing.length > 0 && <p className="muted">{`Set your ${missing.join(" and ")} under Settings, Body, for a body true to yours.`}</p>}
      {model ? (
        <div className="body-viewers">
          {shown === "side" && (
            <>
              <div>
                <p className="muted small">Now</p>
                <BodyViewer key="side-now" model={model} shapes={now_shapes} looks={now_looks} change_from={change_from} link={link} label={now_label} />
              </div>
              <div>
                <p className="muted small">{other_name}</p>
                <BodyViewer key="side-other" model={model} shapes={other_shapes} looks={other_looks} link={link} label={other_label} />
              </div>
            </>
          )}
          {shown === "now" && <BodyViewer key="now" model={model} shapes={now_shapes} looks={now_looks} change_from={change_from} label={now_label} />}
          {shown === "other" && <BodyViewer key="other" model={model} shapes={other_shapes} looks={other_looks} label={other_label} />}
          {shown === "overlay" && <BodyViewer key="overlay" model={model} shapes={both_shapes} looks={overlay_looks} label={overlay_label} />}
        </div>
      ) : (
        <p className="muted">Loading the body…</p>
      )}
      {now && now.lines.length > 0 ? (
        <DataTable caption="Readings the body is shaped to" columns={columns} rows={now.lines.map((line) => ({ ...line, other: other_of(line, other), units }))} row_key={(row) => row.name} />
      ) : (
        <p className="muted">No readings shape the body yet. Log weight, body fat or girths, and pick what each metric shapes under Metrics.</p>
      )}
    </div>
  );
}

export function ShapeTab({ units, settings }: { units: ShownUnits; settings: Record<string, unknown> }) {
  const [date, set_date] = useState(today);
  const [playing, set_playing] = useState(false);
  const shape = use_data((api) => api.get_body_shape(date), [date]);
  // The last day loaded stays drawn while the next one loads, so the view keeps its place.
  const last = useRef<BodyShape | null>(null);
  if (shape.data) last.current = shape.data;

  // While playing, each day moves on to the next a moment after it loads, stopping on the last.
  useEffect(() => {
    if (!playing || !shape.data || shape.data.date !== date) return;
    const next = days_of(shape.data).find((day) => day > date);
    if (!next) return set_playing(false);
    const timer = setTimeout(() => set_date(next), play_step);
    return () => clearTimeout(timer);
  }, [playing, shape.data, date]);

  // Playing from the last day starts again from the first.
  function toggle_play(days: string[]): void {
    if (playing) return set_playing(false);
    if (date >= days[days.length - 1]!) set_date(days[0]!);
    set_playing(true);
  }

  const view = (loaded: BodyShape) => (
    <ShapeView
      shape={loaded}
      units={units}
      saved_looks={settings[looks_key]}
      playing={playing}
      on_date={(day) => {
        set_playing(false);
        set_date(day);
      }}
      on_play={() => toggle_play(days_of(loaded))}
    />
  );
  return last.current && shape.status !== "failed" ? view(last.current) : <Loaded resource={shape}>{view}</Loaded>;
}
