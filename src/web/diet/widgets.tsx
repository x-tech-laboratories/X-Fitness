// The Diet section's own pieces: a food's unit picker and the nutrient fields.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { EnergyUnit } from "@x-tech-laboratories/x-libs/units";
import { NumberField, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { FormGroup } from "@x-tech-laboratories/x-libs/web/react/layout";

import {
  food_units,
  nutrient_groups,
  nutrients,
  serving_unit,
  type Food,
  type NutrientInfo,
  type NutrientKey,
  type Nutrients,
} from "../../shared/diet/model.ts";
import { field_value, format_amount, shown_unit, to_shown_value, to_stored_value } from "./format.ts";

// ── Units ────────────────────────────────────────────────────────────────────

export function serving_label(food: Food): string {
  return `serving (${format_amount(food.serving_size)} ${food.serving_unit})`;
}

// The whole serving, the serving unit and each unit the food defines.
export function FoodUnitSelect({ label, food, value, on_change }: { label: string; food: Food | undefined; value: string; on_change: (unit: string) => void }) {
  if (!food) return <span className="muted">—</span>;
  const options = food_units(food).map((unit): [string, string] => [unit.unit, unit.unit === serving_unit ? serving_label(food) : unit.unit]);
  const known = options.some(([unit]) => unit === value);
  return <Select label={label} bare options={known ? options : [...options, [value, value]]} value={value} on_change={on_change} />;
}

// ── Nutrients ────────────────────────────────────────────────────────────────

const steps: Record<NutrientInfo["shown"], number> = { energy: 10, g: 1, mg: 1, "µg": 1 };

interface NutrientFieldsProps {
  values: Nutrients;
  energy: EnergyUnit;
  on_change: (key: NutrientKey, stored: number) => void;
}

// Each group's fields under its heading, the first group's without one when bare_first.
function NutrientGroups({ infos, values, energy, on_change, bare_first = false }: NutrientFieldsProps & { infos: NutrientInfo[]; bare_first?: boolean }) {
  const groups = nutrient_groups.map((group) => ({ ...group, infos: infos.filter((info) => info.group === group.id) })).filter((group) => group.infos.length > 0);
  return (
    <div className="stack">
      {groups.map((group, index) => (
        <div key={group.id} className="stack tight">
          {!(bare_first && index === 0) && <h3>{group.label}</h3>}
          <div className="diet-nutrient-grid">
            {group.infos.map((info) => (
              <NumberField
                key={info.id}
                label={info.label}
                unit={shown_unit(info, energy)}
                min={0}
                step={steps[info.shown]}
                value={field_value(to_shown_value(info, values[info.key], energy))}
                on_change={(shown) => on_change(info.key, to_stored_value(info, shown ?? 0, energy))}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// A field per nutrient Settings shows, in the units they are shown in, and the rest folded away until a food has some of
// them; on_change gets the value as stored.
export function NutrientFields({ shown, ...props }: NutrientFieldsProps & { shown: NutrientInfo[] }) {
  // Salt is only another view of sodium, so it stays out of the rest.
  const rest = nutrients.filter((info) => !shown.includes(info) && !info.scale);

  return (
    <div className="stack">
      <NutrientGroups {...props} infos={shown} bare_first />
      {rest.length > 0 && (
        <FormGroup summary="More nutrients" open={rest.some((info) => props.values[info.key] > 0)}>
          <NutrientGroups {...props} infos={rest} />
        </FormGroup>
      )}
    </div>
  );
}
