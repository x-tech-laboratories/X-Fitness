// The Trends tab: energy and macros per day over the last weeks, and the average logged day against the targets.

// ── Imports ──────────────────────────────────────────────────────────────────

import { add_days, format_local, parse_local } from "@x-tech-laboratories/x-libs/dates";
import { to_shown, type EnergyUnit } from "@x-tech-laboratories/x-libs/units";
import { LineChart, StackedBarChart } from "@x-tech-laboratories/x-libs/web/react/charts";
import { Segmented } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Facts, Section, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import { Empty, Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import { add_nutrients, empty_nutrients, nutrients, scale_nutrients, target_key, type Nutrients } from "../../shared/diet/model.ts";
import type { DayTotals } from "../../shared/diet/store.ts";
import { use_data } from "../api.ts";
import { format_nutrient } from "./format.ts";
import { today } from "./DiaryTab.tsx";

// ── Figures ──────────────────────────────────────────────────────────────────

const ranges = ["7", "30", "90"] as const;

type Range = (typeof ranges)[number];

const macro_colors: [key: "protein" | "carbs" | "fat", label: string, color: string][] = [
  ["protein", "Protein", "var(--series-1)"],
  ["carbs", "Carbs", "var(--series-2)"],
  ["fat", "Fat", "var(--series-3)"],
];

// The average over the days with anything logged, so a day not tracked does not count as a day of fasting.
export function average_logged_day(days: DayTotals[]): { count: number; average: Nutrients } {
  const logged = days.filter((day) => day.entries > 0);
  const total = logged.reduce((sum, day) => add_nutrients(sum, day.totals), empty_nutrients());
  return { count: logged.length, average: logged.length ? scale_nutrients(total, 1 / logged.length) : total };
}

function Charts({ days, settings, energy }: { days: DayTotals[]; settings: Record<string, unknown>; energy: EnergyUnit }) {
  const { count, average } = average_logged_day(days);
  if (count === 0) return <Empty title="Nothing logged in these days." hint="Log foods in the Diary to see trends here." />;
  const target = Number(settings[target_key("calories")] ?? 0);
  const logged = days.filter((day) => day.entries > 0);

  return (
    <>
      <Section title="Energy per day">
        <LineChart
          title={`Energy per day (${energy})`}
          series={[{ label: "Eaten", color: "var(--series-1)", points: days.map((day) => [parse_local(day.date).getTime() / 1000, day.entries ? to_shown(day.totals.calories, energy) : null]) }]}
          limits={target > 0 ? [{ label: "Target", value: to_shown(target, energy), color: "var(--status-danger)" }] : []}
          format={(value) => `${Math.round(value).toLocaleString()} ${energy}`}
        />
      </Section>
      <Section title="Macros per day">
        <StackedBarChart
          title="Macros per day (g)"
          stacks={logged.map((day) => ({ label: day.date.slice(5), parts: macro_colors.map(([key, label, color]) => ({ label, value: day.totals[key], color })) }))}
          legend={macro_colors.map(([, label, color]): [string, string] => [label, color])}
          format={(value) => `${Math.round(value)} g`}
        />
      </Section>
      <Section title={`Average of ${count} logged day${count === 1 ? "" : "s"}`}>
        <Facts
          rows={nutrients.map((info) => {
            const goal = Number(settings[target_key(info.key)] ?? 0);
            return [info.label, goal > 0 ? `${format_nutrient(info, average[info.key], energy)} of ${format_nutrient(info, goal, energy)}` : format_nutrient(info, average[info.key], energy)];
          })}
        />
      </Section>
    </>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

export function TrendsTab({ settings, energy }: { settings: Record<string, unknown>; energy: EnergyUnit }) {
  const [range, set_range] = use_pref<Range>("x-fitness-diet-trend-days", "30", (value): value is Range => ranges.includes(value as Range));
  const to = today();
  const from = format_local(add_days(parse_local(to), 1 - Number(range)), false);
  const days = use_data((api) => api.list_daily_totals(from, to), [from, to]);

  return (
    <div className="stack">
      <Toolbar>
        <Segmented label="Days shown" choices={ranges.map((days) => ({ value: days, label: `${days} days` }))} value={range} on_change={set_range} />
      </Toolbar>
      <Loaded resource={days}>{(loaded) => <Charts days={loaded} settings={settings} energy={energy} />}</Loaded>
    </div>
  );
}
