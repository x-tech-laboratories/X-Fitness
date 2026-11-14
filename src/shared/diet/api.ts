// The diet calls described for other programs: what each does and the arguments it takes.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { JsonSchema, MethodSpec } from "@x-tech-laboratories/x-libs/api_spec";

import { categories, day, id_of, json_file, moment, number, text } from "../api_schemas.ts";
import { nutrient_keys } from "./model.ts";

// ── Shapes ───────────────────────────────────────────────────────────────────

const nutrients: JsonSchema = {
  type: "object",
  properties: Object.fromEntries(nutrient_keys.map((key) => [key, { type: "number" }])),
  additionalProperties: false,
  description: "Per serving: calories in kcal and every other nutrient in grams, sodium, cholesterol, the vitamins and the minerals too; a nutrient left out counts as 0.",
};

const portion: JsonSchema = {
  type: "object",
  properties: {
    unit: text("The other unit, such as cup."),
    amount: number("How many of that unit."),
    size: number("Equal to this much of size_unit."),
    size_unit: text("The unit size is in; the serving unit when empty."),
  },
  required: ["unit", "amount", "size"],
};

const amount: JsonSchema = { type: "number", exclusiveMinimum: 0, description: "How much, above 0." };

const name: JsonSchema = text("The name.");

// ── Calls ────────────────────────────────────────────────────────────────────

export const diet_api = {
  get_diet: {
    description: "Every food and recipe with its id, nutrients and categories, the category, unit and brand lists, and the grocery list.",
    params: [],
  },
  save_food: {
    description: "Adds a food, or replaces the one with the id given. Gives back its id.",
    params: [
      {
        name: "food",
        schema: {
          type: "object",
          properties: {
            id: text("The food's id when replacing it; leave out to add one."),
            name,
            brand: text("The brand, if any."),
            comment: text("A note on the food."),
            serving_size: number("How big one serving is, in serving_unit."),
            serving_unit: text("The unit a serving is measured in, such as g or slice."),
            portions: { type: "array", items: portion, description: "Other units the food can be measured in." },
            categories,
            nutrients,
          },
          required: ["name", "serving_size", "serving_unit", "nutrients"],
        },
      },
    ],
  },
  delete_food: { description: "Deletes a food.", params: [{ name: "id", schema: id_of("food") }] },
  save_recipe: {
    description: "Adds a recipe, or replaces the one with the id given, ingredients and all. Gives back its id.",
    params: [
      {
        name: "recipe",
        schema: {
          type: "object",
          properties: {
            id: text("The recipe's id when replacing it; leave out to add one."),
            name,
            comment: text("A note on the recipe."),
            servings: number("How many servings the recipe makes."),
            serving_unit: text("What one serving is, such as bowl."),
            categories,
            ingredients: {
              type: "array",
              items: {
                type: "object",
                properties: { food_id: id_of("food"), amount, unit: text("A unit of the food; empty for its serving unit.") },
                required: ["food_id", "amount"],
              },
            },
          },
          required: ["name", "servings", "serving_unit", "ingredients"],
        },
      },
    ],
  },
  delete_recipe: { description: "Deletes a recipe.", params: [{ name: "id", schema: id_of("recipe") }] },
  get_diary_day: {
    description: "One day's diary: each entry with its food or recipe, amount and nutrients, the day's totals, and the targets in force, 0 meaning none; calories in kcal and the rest in grams.",
    params: [{ name: "date", schema: day }],
  },
  get_diet_targets: {
    description:
      "Each nutrient's daily target in force, in kcal for calories and grams for the rest, 0 meaning none: whether the page shows it, whether it is a goal to reach or a limit, what the target preset gives, and whether the target comes from the plan on Calculators → Goals, was set by hand (a diet.target_<nutrient> setting, which set_setting to null hands back to the preset) or follows the preset. Also names the nutrition label and the target preset chosen in Settings.",
    params: [],
  },
  list_daily_totals: {
    description: "Each day's nutrient totals from one day to another, days with nothing logged as zero.",
    params: [{ name: "from", schema: day }, { name: "to", schema: day }],
  },
  add_diary_entry: {
    description: "Logs a food or recipe eaten on a day. Gives back the entry's id.",
    params: [
      {
        name: "entry",
        schema: {
          type: "object",
          properties: {
            date: day,
            kind: { type: "string", enum: ["food", "recipe"] },
            ref_id: text("The food's or recipe's id."),
            amount,
            unit: text("For a food, the unit the amount is in, one of its portions or serving; recipes are always in servings."),
            logged_at: moment,
          },
          required: ["date", "kind", "ref_id", "amount"],
        },
      },
    ],
  },
  remove_diary_entry: { description: "Removes a diary entry.", params: [{ name: "id", schema: id_of("diary entry") }] },
  add_category: { description: "Adds a diet category.", params: [{ name: "name", schema: text('The category path, such as "Protein/Meat".') }] },
  rename_category: {
    description: "Renames a diet category with its subcategories on every food and recipe; a name already in use merges the two.",
    params: [{ name: "from", schema: text("The category path now.") }, { name: "to", schema: text("The new path.") }],
  },
  delete_category: {
    description: "Deletes a diet category and its subcategories from every food and recipe; the foods and recipes stay.",
    params: [{ name: "name", schema: text("The category path.") }],
  },
  add_unit: { description: "Adds a unit foods can be measured in.", params: [{ name: "name", schema: name }] },
  rename_unit: {
    description: "Renames a unit on every food, recipe and grocery line using it; a name already in use merges the two.",
    params: [{ name: "from", schema: text("The unit now.") }, { name: "to", schema: text("The new name.") }],
  },
  delete_unit: { description: "Deletes a unit nothing uses; one in use is refused.", params: [{ name: "name", schema: name }] },
  add_grocery_item: {
    description: "Puts a food on the grocery list, its unit and brand starting from the food's. Gives back the line's id.",
    params: [
      {
        name: "item",
        schema: {
          type: "object",
          properties: { food_id: id_of("food"), amount, unit: text("The unit; the food's serving unit when empty."), brand: text("The brand to buy."), comment: text("A note.") },
          required: ["food_id", "amount"],
        },
      },
    ],
  },
  update_grocery_item: {
    description: "Changes a grocery line; only the fields given change.",
    params: [
      { name: "id", schema: id_of("grocery line") },
      {
        name: "changes",
        schema: {
          type: "object",
          properties: { brand: text("The brand."), amount, unit: text("The unit."), comment: text("A note."), done: { type: "boolean", description: "Whether it was bought." } },
        },
      },
    ],
  },
  remove_grocery_item: { description: "Removes a grocery line.", params: [{ name: "id", schema: id_of("grocery line") }] },
  clear_bought_groceries: { description: "Removes every grocery line marked bought. Gives back how many went.", params: [] },
  search_online_foods: {
    description: "Searches Open Food Facts and, with a key in Settings, USDA FoodData Central for foods with their nutrients, to save with save_food.",
    params: [{ name: "query", schema: text("A food's name.") }],
  },
  export_diet_json: { description: "The whole diet as JSON in the Trilium diet add-on's format.", params: [] },
  import_trilium_diet: {
    description: "Merges a Trilium diet add-on database.json: foods and recipes with the same id are replaced, diary entries and grocery lines are added once.",
    params: [{ name: "json_text", schema: json_file }],
  },
} satisfies Record<string, MethodSpec>;
