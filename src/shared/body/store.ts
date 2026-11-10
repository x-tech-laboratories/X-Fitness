// Body metrics: weight, body fat, girths and any other measure, one reading per metric a day.

// ── Imports ──────────────────────────────────────────────────────────────────

import { define_feature } from "../feature.ts";

// ── Store ────────────────────────────────────────────────────────────────────

export const body_feature = define_feature({
  id: "body",
  migrations: [],
  tables: [],
  methods: {},
});
