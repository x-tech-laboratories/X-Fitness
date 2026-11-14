// The You card on Body → Metrics: the sex and birth date the 3D body and the calculators read, and the age it gives.

// ── Imports ──────────────────────────────────────────────────────────────────

import { today } from "@x-tech-laboratories/x-libs/dates";
import { CommitInput, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Card, FormRow } from "@x-tech-laboratories/x-libs/web/react/layout";

import { age_on, sex_of } from "../../shared/calculators/formulas.ts";
import { set_setting } from "../api.ts";
import { sex_options } from "../calculators/options.ts";

// ── Card ─────────────────────────────────────────────────────────────────────

export function YouCard({ settings }: { settings: Record<string, unknown> }) {
  const sex = sex_of(settings["body.sex"]);
  const birth_date = String(settings["body.birth_date"] ?? "");
  const age = age_on(birth_date, today());
  return (
    <Card title="You" subtitle="Not metrics, but read with them: the 3D body starts from the sex, and the calculators take the age.">
      <div className="form-rows">
        <FormRow label="Sex" id="body-sex" hint="Not set mixes the two.">
          <Select bare id="body-sex" label="Sex" options={sex_options} value={sex} on_change={(value) => void set_setting("body.sex", value)} />
        </FormRow>
        <FormRow label="Birth date" id="body-birth-date" hint={age > 0 ? `${age} years old` : "Gives the age the energy and caliper formulas take."}>
          <CommitInput
            id="body-birth-date"
            type="date"
            value={birth_date}
            on_commit={(event) => {
              const value = event.currentTarget.value;
              if (value !== birth_date) void set_setting("body.birth_date", value);
            }}
          />
        </FormRow>
      </div>
    </Card>
  );
}
