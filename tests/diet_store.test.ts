import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { food_units, food_unit_problems, normalize_food, target_progress } from "../src/shared/diet/model.ts";
import { bind_methods, open_store, setting_defaults, sync_engine } from "../src/shared/store.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

function open_methods() {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  return { database, methods: bind_methods(() => database, () => undefined) };
}

const oats = { name: "Oats", brand: "Quaker", serving_size: 100, serving_unit: "g", nutrients: { calories: 380, protein: 13, carbs: 60, fat: 7, sodium: 0.006 } };

const eggs = {
  name: "Egg",
  serving_size: 1,
  serving_unit: "egg",
  portions: [
    { unit: "tray", amount: 1, size: 5, size_unit: "box" },
    { unit: "box", amount: 1, size: 6, size_unit: "" },
  ],
  nutrients: { calories: 70, protein: 6 },
};

describe("diet store", () => {
  it("keeps its tables in sync order and its targets among the settings", () => {
    const { database } = open_methods();
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'diet_%'").all().map((row) => row.name);
    expect(tables).toEqual(expect.arrayContaining(["diet_foods", "diet_recipes", "diet_ingredients", "diet_diary", "diet_grocery", "diet_categories", "diet_units"]));
    expect(setting_defaults["diet.target_calories"]).toBe(2000);
    expect(setting_defaults["diet.target_sodium"]).toBe(2.3);
    expect(setting_defaults["diet.usda_api_key"]).toBe("");
  });

  it("saves a food with an id every device can make and refuses one without a name", () => {
    const { methods } = open_methods();
    const id = methods.save_food(oats);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const [food] = methods.get_diet().foods;
    expect(food).toMatchObject({ id, name: "Oats", brand: "Quaker", serving_unit: "g" });
    expect(food!.nutrients.sodium).toBeCloseTo(0.006);
    methods.save_food({ ...oats, id, name: "Rolled oats" });
    expect(methods.get_diet().foods.map((each) => each.name)).toEqual(["Rolled oats"]);
    expect(() => methods.save_food({ ...oats, name: "  " })).toThrow("A food needs a name.");
  });

  it("measures a food in its serving, its serving unit and chained portions, and names the ones that loop", () => {
    const egg = normalize_food(eggs);
    expect(food_units(egg)).toEqual([
      { unit: "serving", size: 1 },
      { unit: "egg", size: 1 },
      { unit: "tray", size: 30 },
      { unit: "box", size: 6 },
    ]);
    const looping = normalize_food({ ...eggs, portions: [{ unit: "box", size: 2, size_unit: "tray" }, { unit: "tray", size: 3, size_unit: "box" }, { unit: "pack", amount: 4, size: 30, size_unit: "" }] });
    expect(food_unit_problems(looping)).toEqual(["box", "tray"]);
    expect(food_units(looping).find((unit) => unit.unit === "pack")?.size).toBe(7.5);
  });

  it("totals a day from foods in any of their units and recipes per serving", () => {
    const { methods } = open_methods();
    const oats_id = methods.save_food(oats);
    const egg_id = methods.save_food(eggs);
    const recipe_id = methods.save_recipe({
      name: "Porridge",
      servings: 2,
      serving_unit: "bowl",
      ingredients: [
        { food_id: oats_id, amount: 100, unit: "g" },
        { food_id: egg_id, amount: 1, unit: "box" },
      ],
    });

    methods.add_diary_entry({ date: "2026-11-10", kind: "food", ref_id: oats_id, amount: 50, unit: "g" });
    methods.add_diary_entry({ date: "2026-11-10", kind: "food", ref_id: egg_id, amount: 2, unit: "" });
    methods.add_diary_entry({ date: "2026-11-10", kind: "recipe", ref_id: recipe_id, amount: 1 });
    methods.add_diary_entry({ date: "2026-11-11", kind: "food", ref_id: oats_id, amount: 1 });

    const day = methods.get_diary_day("2026-11-10");
    expect(day.entries.map((entry) => [entry.label, entry.amount, entry.unit_label])).toEqual([
      ["Oats (Quaker)", 50, "g"],
      ["Egg", 2, "serving"],
      ["Porridge", 1, "bowl"],
    ]);
    // 190 from oats, 140 from two eggs, and half of 380 + 6 × 70 for a bowl.
    expect(day.totals.calories).toBeCloseTo(190 + 140 + (380 + 420) / 2);
    expect(day.totals.protein).toBeCloseTo(6.5 + 12 + (13 + 36) / 2);

    methods.delete_food(egg_id);
    const after = methods.get_diary_day("2026-11-10");
    expect(after.entries[1]).toMatchObject({ label: "(deleted)", found: false });
    expect(after.totals.calories).toBeCloseTo(190 + 380 / 2);

    expect(() => methods.add_diary_entry({ date: "2026-11-10", kind: "food", ref_id: oats_id, amount: 0 })).toThrow("The amount must be more than 0.");
  });

  it("lists every day of a range with its totals for the trends", () => {
    const { methods } = open_methods();
    const oats_id = methods.save_food(oats);
    methods.add_diary_entry({ date: "2026-11-09", kind: "food", ref_id: oats_id, amount: 1 });
    const days = methods.list_daily_totals("2026-11-08", "2026-11-10");
    expect(days.map((day) => [day.date, day.entries, day.totals.calories])).toEqual([
      ["2026-11-08", 0, 0],
      ["2026-11-09", 1, 380],
      ["2026-11-10", 0, 0],
    ]);
  });

  it("removes an entry and puts it back with the same id for undo", () => {
    const { methods } = open_methods();
    const oats_id = methods.save_food(oats);
    const id = methods.add_diary_entry({ date: "2026-11-10", kind: "food", ref_id: oats_id, amount: 1 });
    const [entry] = methods.get_diary_day("2026-11-10").entries;
    methods.remove_diary_entry(id);
    expect(methods.get_diary_day("2026-11-10").entries).toEqual([]);
    methods.add_diary_entry(entry!);
    expect(methods.get_diary_day("2026-11-10").entries.map((each) => each.id)).toEqual([id]);
  });

  it("compares a total to its target, a target of 0 meaning none", () => {
    expect(target_progress(2500, 2000)).toEqual({ target: 2000, percent: 100, over: true });
    expect(target_progress(500, 2000)).toEqual({ target: 2000, percent: 25, over: false });
    expect(target_progress(500, 0)).toEqual({ target: null, percent: 0, over: false });
  });

  it("replaces a recipe's ingredients and drops them with the recipe", () => {
    const { database, methods } = open_methods();
    const oats_id = methods.save_food(oats);
    const id = methods.save_recipe({ name: "Porridge", servings: 1, serving_unit: "bowl", ingredients: [{ food_id: oats_id, amount: 40, unit: "" }, { food_id: oats_id, amount: 10, unit: "g" }] });
    methods.save_recipe({ id, name: "Porridge", servings: 1, serving_unit: "bowl", ingredients: [{ food_id: oats_id, amount: 60, unit: "g" }] });
    expect(methods.get_diet().recipes[0]!.ingredients).toEqual([{ food_id: oats_id, amount: 60, unit: "g" }]);
    methods.delete_recipe(id);
    expect(database.prepare("SELECT count(*) AS count FROM diet_ingredients").get()).toEqual({ count: 0 });
  });

  it("nests categories, moves a subtree on rename, merges onto an existing one and deletes a subtree", () => {
    const { methods } = open_methods();
    methods.add_category("Snack");
    const chicken = methods.save_food({ ...oats, name: "Chicken", categories: ["Protein/Meat/Poultry", "protein/meat/poultry"] });
    methods.save_food({ ...oats, name: "Tofu", categories: ["Protein"] });
    expect(methods.get_diet().categories).toEqual(["Protein", "Protein/Meat", "Protein/Meat/Poultry", "Snack"]);

    methods.rename_category("Protein", "Macros/Protein");
    expect(methods.get_diet().foods.find((food) => food.id === chicken)!.categories).toEqual(["Macros/Protein/Meat/Poultry"]);

    methods.rename_category("Snack", "Macros/Protein");
    expect(methods.get_diet().categories).toEqual(["Macros", "Macros/Protein", "Macros/Protein/Meat", "Macros/Protein/Meat/Poultry"]);

    methods.delete_category("Macros/Protein/Meat");
    const data = methods.get_diet();
    expect(data.foods.map((food) => [food.name, food.categories])).toEqual([["Chicken", []], ["Tofu", ["Macros/Protein"]]]);
    expect(data.categories).toEqual(["Macros", "Macros/Protein"]);
  });

  it("renames a unit everywhere, merging onto another, and refuses to delete one in use", () => {
    const { methods } = open_methods();
    methods.add_unit("gram");
    methods.add_unit("GRAM");
    const id = methods.save_food({ ...oats, serving_unit: "gram" });
    methods.add_grocery_item({ food_id: id, amount: 2 });
    expect(methods.get_diet().units).toEqual(["gram"]);
    expect(() => methods.delete_unit("gram")).toThrow('"gram" is still used by 1 food(s), 0 recipe(s) and 1 grocery line(s).');

    methods.rename_unit("gram", "g");
    const data = methods.get_diet();
    expect(data.units).toEqual(["g"]);
    expect(data.grocery[0]!.unit).toBe("g");
    methods.add_unit("cup");
    methods.delete_unit("cup");
    expect(methods.get_diet().units).toEqual(["g"]);
  });

  it("keeps one grocery line per food, prefilled from the food, and clears the bought ones", () => {
    const { methods } = open_methods();
    const id = methods.save_food({ ...oats, comment: "Big bag" });
    const other = methods.save_food({ ...oats, name: "Rice", brand: "", comment: "Basmati" });
    methods.add_grocery_item({ food_id: id, amount: 2 });
    expect(methods.get_diet().grocery[0]).toMatchObject({ brand: "Quaker", unit: "g", comment: "", done: false });
    expect(() => methods.add_grocery_item({ food_id: id, amount: 1 })).toThrow("Oats (Quaker) is already on the list.");

    methods.set_setting("diet.prefill_grocery_comment", true);
    const line = methods.add_grocery_item({ food_id: other, amount: 1, unit: "bag" });
    expect(methods.get_diet().grocery[1]).toMatchObject({ comment: "Basmati", unit: "bag" });

    methods.update_grocery_item(line, { done: true, comment: "whatever's on offer" });
    expect(methods.get_diet().grocery[1]).toMatchObject({ done: true, comment: "whatever's on offer" });
    expect(methods.clear_bought_groceries()).toBe(1);
    expect(methods.get_diet().grocery.map((item) => item.food_id)).toEqual([id]);
  });
});

// ── Import and export ────────────────────────────────────────────────────────

const trilium_database = JSON.stringify({
  categories: ["Protein", "Protein/Meat", "Snack"],
  units: ["bowl", "g", "pack"],
  foods: {
    a1b2c3d4: {
      id: "a1b2c3d4",
      name: "Chicken Breast",
      brand: "",
      comment: "",
      servingSize: 100,
      servingUnit: "g",
      portions: [{ unit: "breast", amount: 1, size: 170, sizeUnit: "g" }],
      tags: ["Protein/Meat"],
      nutrients: { calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0, saturatedFat: 1, sodium: 74, cholesterol: 85 },
    },
    oldfood1: { name: "Rice", servingSize: 100, nutrients: { calories: 130 } },
  },
  recipes: {
    e5f6g7h8: { id: "e5f6g7h8", name: "Chicken Salad", comment: "", servings: 2, servingUnit: "bowl", tags: ["Protein"], ingredients: [{ foodId: "a1b2c3d4", amount: 1, unit: "breast" }] },
  },
  diary: {
    "2026-07-22": [
      { id: "i1j2k3l4", kind: "food", refId: "a1b2c3d4", servings: 1, unit: "breast", loggedAt: "2026-07-22T12:00:00.000Z" },
      { id: "q1r2s3t4", kind: "food", refId: "oldfood1", servings: 2, loggedAt: "2026-07-22T13:00:00.000Z" },
      { id: "u1v2w3x4", kind: "recipe", refId: "e5f6g7h8", servings: 1, loggedAt: "2026-07-22T19:00:00.000Z" },
    ],
  },
  grocery: [{ id: "m1n2o3p4", foodId: "a1b2c3d4", brand: "Store own", amount: 2, unit: "pack", comment: "corn only", done: false }],
});

describe("Trilium Diet Manager import", () => {
  it("reads the add-on's database, sodium and cholesterol from mg, entries without a unit as servings", () => {
    const { methods } = open_methods();
    expect(methods.import_trilium_diet(trilium_database)).toEqual({ foods: 2, recipes: 1, diary: 3, grocery: 1 });

    const data = methods.get_diet();
    const chicken = data.foods.find((food) => food.id === "a1b2c3d4")!;
    expect(chicken).toMatchObject({ name: "Chicken Breast", categories: ["Protein/Meat"], portions: [{ unit: "breast", amount: 1, size: 170, size_unit: "g" }] });
    expect(chicken.nutrients.sodium).toBeCloseTo(0.074);
    expect(chicken.nutrients.cholesterol).toBeCloseTo(0.085);
    expect(chicken.nutrients.saturated_fat).toBe(1);
    expect(data.foods.find((food) => food.id === "oldfood1")).toMatchObject({ serving_unit: "g", categories: [] });
    expect(data.categories).toEqual(["Protein", "Protein/Meat", "Snack"]);
    expect(data.units).toEqual(["bowl", "g", "pack"]);
    expect(data.grocery).toEqual([{ id: "m1n2o3p4", food_id: "a1b2c3d4", brand: "Store own", amount: 2, unit: "pack", comment: "corn only", done: false }]);

    const day = methods.get_diary_day("2026-07-22");
    expect(day.entries.map((entry) => [entry.id, entry.unit_label])).toEqual([["i1j2k3l4", "breast"], ["q1r2s3t4", "serving"], ["u1v2w3x4", "bowl"]]);
    // A breast is 170 g, two servings of rice, and half the salad's one breast.
    expect(day.totals.calories).toBeCloseTo(165 * 1.7 + 260 + (165 * 1.7) / 2);
  });

  it("merges instead of duplicating when the same file comes again, keeping what was here", () => {
    const { methods } = open_methods();
    const own = methods.save_food(oats);
    methods.import_trilium_diet(trilium_database);
    expect(methods.import_trilium_diet(trilium_database)).toEqual({ foods: 2, recipes: 1, diary: 0, grocery: 0 });
    const data = methods.get_diet();
    expect(data.foods.map((food) => food.id).sort()).toEqual(["a1b2c3d4", "oldfood1", own].sort());
    expect(data.recipes[0]!.ingredients).toHaveLength(1);
    expect(methods.get_diary_day("2026-07-22").entries).toHaveLength(3);
    expect(data.grocery).toHaveLength(1);
  });

  it("refuses what is not the add-on's database and leaves the data alone", () => {
    const { methods } = open_methods();
    expect(() => methods.import_trilium_diet("not json")).toThrow("Not valid JSON.");
    expect(() => methods.import_trilium_diet("[1, 2]")).toThrow("Expected a JSON object");
    expect(methods.get_diet().foods).toEqual([]);
  });

  it("exports in the add-on's format, which imports back to the same data", () => {
    const { methods } = open_methods();
    methods.import_trilium_diet(trilium_database);
    const exported = JSON.parse(methods.export_diet_json());
    expect(exported.foods.a1b2c3d4.nutrients).toMatchObject({ sodium: 74, cholesterol: 85, saturatedFat: 1 });
    expect(exported.foods.a1b2c3d4.portions).toEqual([{ unit: "breast", amount: 1, size: 170, sizeUnit: "g" }]);
    expect(exported.diary["2026-07-22"]).toHaveLength(3);
    expect(exported.recipes.e5f6g7h8.ingredients).toEqual([{ foodId: "a1b2c3d4", amount: 1, unit: "breast" }]);

    const { methods: other } = open_methods();
    other.import_trilium_diet(JSON.stringify(exported));
    expect(other.get_diet()).toEqual(methods.get_diet());
  });
});

// ── Lookup ───────────────────────────────────────────────────────────────────

const open_food_facts_reply = {
  products: [
    { code: "301", product_name: "Peanut Butter", brands: "Nutty, Other", nutriments: { "energy-kcal_100g": 600, proteins_100g: 25, "saturated-fat_100g": 8, sodium_100g: 0.4, cholesterol_100g: 0 } },
    { code: "302", nutriments: {} },
  ],
};

const usda_reply = {
  foods: [
    {
      fdcId: 171705,
      description: "Peanut butter, smooth",
      brandOwner: "Acme",
      foodNutrients: [
        { nutrientNumber: "208", unitName: "KCAL", value: 597 },
        { nutrientNumber: "203", unitName: "G", value: 22.2 },
        { nutrientNumber: "307", unitName: "MG", value: 459 },
        { nutrientNumber: "601", value: 0 },
      ],
    },
  ],
};

function stub_fetch(replies: Record<string, unknown | number>) {
  const fetcher = vi.fn(async (url: string) => {
    const host = new URL(url).host;
    const reply = replies[host];
    if (typeof reply === "number") return new Response("", { status: reply, statusText: "Forbidden" });
    return new Response(JSON.stringify(reply), { status: 200 });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

describe("food lookup", () => {
  it("asks only Open Food Facts without a USDA key and reads its grams per 100 g", async () => {
    const fetcher = stub_fetch({ "world.openfoodfacts.org": open_food_facts_reply });
    const { methods } = open_methods();
    const reply = await methods.search_online_foods("peanut butter");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]![0])).toContain("search_terms=peanut%20butter");
    expect(reply.searched_usda).toBe(false);
    expect(reply.errors).toEqual([]);
    expect(reply.results).toEqual([
      {
        source: "Open Food Facts",
        key: "off-301",
        name: "Peanut Butter",
        brand: "Nutty",
        serving_size: 100,
        serving_unit: "g",
        nutrients: { calories: 600, protein: 25, carbs: 0, fat: 0, fiber: 0, sugar: 0, saturated_fat: 8, sodium: 0.4, cholesterol: 0 },
      },
    ]);
  });

  it("merges USDA results with the key from Settings, its mg read as grams", async () => {
    const fetcher = stub_fetch({ "world.openfoodfacts.org": open_food_facts_reply, "api.nal.usda.gov": usda_reply });
    const { methods } = open_methods();
    methods.set_setting("diet.usda_api_key", "test-key");
    const reply = await methods.search_online_foods("peanut butter");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(reply.searched_usda).toBe(true);
    expect(reply.results.map((result) => [result.source, result.name, result.brand])).toEqual([
      ["Open Food Facts", "Peanut Butter", "Nutty"],
      ["USDA", "Peanut butter, smooth", "Acme"],
    ]);
    const usda = reply.results[1]!;
    expect(usda.nutrients.calories).toBe(597);
    expect(usda.nutrients.sodium).toBeCloseTo(0.459);
    expect(usda.key).toBe("usda-171705");
  });

  it("reports a failing source without hiding the other's results or naming the key", async () => {
    stub_fetch({ "world.openfoodfacts.org": open_food_facts_reply, "api.nal.usda.gov": 403 });
    const { methods } = open_methods();
    methods.set_setting("diet.usda_api_key", "test-key");
    const reply = await methods.search_online_foods("peanut butter");
    expect(reply.results.map((result) => result.source)).toEqual(["Open Food Facts"]);
    expect(reply.errors).toEqual(["USDA FoodData Central request failed: 403 Forbidden"]);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed for https://api.nal.usda.gov/?api_key=test-key"); }));
    const offline = await methods.search_online_foods("peanut butter");
    expect(offline.errors).toEqual(["Open Food Facts could not be reached.", "USDA FoodData Central could not be reached."]);
    expect(offline.errors.join(" ")).not.toContain("test-key");
  });

  it("carries a food and the diary entry that logs it to another device through sync", () => {
    const phone = open_methods();
    const desktop = open_methods();
    const food_id = phone.methods.save_food(oats);
    phone.methods.add_diary_entry({ date: "2026-11-10", kind: "food", ref_id: food_id, amount: 50, unit: "g" });

    const outgoing = sync_engine.collect_unpushed_changes(phone.database);
    sync_engine.apply_changes(desktop.database, outgoing.changes);

    expect(desktop.methods.get_diet().foods).toEqual(phone.methods.get_diet().foods);
    const day = desktop.methods.get_diary_day("2026-11-10");
    expect(day.entries.map((entry) => [entry.ref_id, entry.label, entry.found, entry.amount])).toEqual([[food_id, "Oats (Quaker)", true, 50]]);
    expect(day.totals.calories).toBeCloseTo(190);
  });
});
