// The Overview's next actions: each meal and the followed program's next session, missed ones first, then the soonest.

// ── Imports ──────────────────────────────────────────────────────────────────

import { format_local, has_time, parse_local, relative_day_label } from "@x-tech-laboratories/x-libs/dates";
import { until } from "@x-tech-laboratories/x-libs/web/format";
import { Badge } from "@x-tech-laboratories/x-libs/web/react/badges";
import { Section } from "@x-tech-laboratories/x-libs/web/react/layout";
import { Empty, Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { DataTable, type TableColumn } from "@x-tech-laboratories/x-libs/web/react/table";
import { use_now } from "@x-tech-laboratories/x-libs/web/react/time";

import type { NextAction } from "../../shared/schedule/model.ts";
import { use_data } from "../api.ts";

// ── Table ────────────────────────────────────────────────────────────────────

const hrefs: Record<NextAction["kind"], string> = { meal: "#/diet/diary", workout: "#/workouts/log" };

// A training day without a time is due from the start of its day, and "today" until it is over.
function when_text(action: NextAction, now: Date): string {
  if (!has_time(action.due) && action.due === format_local(now, false)) return "today";
  return until(Math.floor(parse_local(action.due).getTime() / 1000));
}

function columns(now: Date): TableColumn<NextAction>[] {
  return [
    {
      label: "When",
      cell: (action) => when_text(action, now),
      text: (action) => when_text(action, now),
      sort: (action) => parse_local(action.due).getTime(),
    },
    {
      label: "What",
      cell: (action) => (
        <>
          <a href={hrefs[action.kind]}>{action.title}</a> {action.overdue && <Badge tone="warn">Missed</Badge>}
        </>
      ),
      text: (action) => action.title,
    },
    { label: "At", cell: (action) => relative_day_label(action.due, now), sort: (action) => parse_local(action.due).getTime() },
  ];
}

// ── Section ──────────────────────────────────────────────────────────────────

export function NextActions() {
  const now = use_now();
  const moment = format_local(now, true);
  const actions = use_data((api) => api.list_next_actions(moment), [moment]);
  return (
    <Section title="Next up" tools={<a href="#/settings">Schedule</a>}>
      <Loaded resource={actions}>
        {(list) =>
          list.length === 0 ? (
            <Empty title="Nothing scheduled." hint="Give meals a start time under Settings → Diet, or follow a program under Settings → Workouts." />
          ) : (
            <DataTable caption="Next actions" columns={columns(now)} rows={list} row_key={(action) => `${action.kind}:${action.id}`} column_hiding={false} />
          )
        }
      </Loaded>
    </Section>
  );
}
