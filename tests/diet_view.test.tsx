// @vitest-environment jsdom
import "@x-tech-laboratories/x-libs/web/react/test_stubs";
import { DatabaseSync } from "node:sqlite";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { today } from "@x-tech-laboratories/x-libs/dates";
import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import { Dialogs } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { Toasts } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { bind_methods, open_store, type FitnessMethods } from "../src/shared/store.ts";
import { set_page_api } from "../src/web/api.ts";
import { DietView } from "../src/web/diet/index.tsx";
import { SettingsView } from "../src/web/settings/SettingsView.tsx";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
});

// The page's calls answered by a real store on a throwaway database, as the phone's page does.
function start(settings: Record<string, unknown> = {}) {
  const database = new DatabaseSync(":memory:");
  open_store(database);
  const methods = bind_methods(() => database, () => undefined);
  for (const [key, value] of Object.entries(settings)) methods.set_setting(key, value);
  const calls = Object.fromEntries(
    Object.entries(methods).map(([name, call]) => [name, vi.fn(async (...args: unknown[]) => (call as (...args: unknown[]) => unknown)(...args))]),
  ) as unknown as Client<FitnessMethods>;
  set_page_api({ host: "web", calls, device: null, on_change: () => () => undefined });
  return { methods, calls };
}

function show(parts: string[]) {
  return render(
    <>
      <DietView parts={parts} />
      <Dialogs />
      <Toasts />
    </>,
  );
}

const oats = { name: "Oats", brand: "Quaker", serving_size: 100, serving_unit: "g", comment: "Big bag", nutrients: { calories: 380, protein: 13, carbs: 60, fat: 7 } };

function type_number(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

describe("diet diary", () => {
  it("shows the day's totals against the targets and logs a food in one of its units", async () => {
    const { methods, calls } = start({ "diet.target_calories": 300 });
    const id = methods.save_food(oats);
    methods.add_diary_entry({ date: today(), kind: "food", ref_id: id, amount: 50, unit: "g" });
    show(["diary"]);

    expect(await screen.findByText("190 kcal / 300 kcal")).toBeTruthy();
    expect(screen.getByText("6.5 g / 50 g")).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Oats (Quaker)" })).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox", { name: "Food" }), { target: { value: id } });
    type_number(screen.getByRole("textbox", { name: "Amount" }), "25");
    fireEvent.change(screen.getByRole("combobox", { name: "Unit" }), { target: { value: "g" } });
    fireEvent.click(screen.getByRole("button", { name: "Log" }));

    expect(await screen.findByText("285 kcal / 300 kcal")).toBeTruthy();
    expect(calls.add_diary_entry).toHaveBeenCalledWith({ date: today(), kind: "food", ref_id: id, amount: 25, unit: "g", meal: expect.any(String) });

    methods.add_diary_entry({ date: today(), kind: "food", ref_id: id, amount: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    fireEvent.click(await screen.findByRole("button", { name: "Today" }));
    expect(await screen.findByText("665 kcal / 300 kcal · over")).toBeTruthy();
  });

  it("shows the label's nutrients and those switched on, vitamins and minerals never as over", async () => {
    const { methods } = start({ "diet.shown": { vitamin_c: true } });
    const id = methods.save_food({ ...oats, nutrients: { ...oats.nutrients, vitamin_c: 0.12, iron: 0.0047, magnesium: 0.1 } });
    methods.add_diary_entry({ date: today(), kind: "food", ref_id: id, amount: 1 });
    show(["diary"]);

    expect(await screen.findByRole("heading", { name: "Vitamins" })).toBeTruthy();
    expect(screen.getByText("120 mg / 90 mg")).toBeTruthy();
    expect(screen.getByText("4.7 mg / 18 mg")).toBeTruthy();
    // Magnesium is not on the US label.
    expect(screen.queryByText("Magnesium")).toBeNull();
  });

  it("shows salt against the EU reference intake on the EU label", async () => {
    const { methods } = start({ "diet.label": "eu", "diet.targets": "eu" });
    const id = methods.save_food({ ...oats, nutrients: { ...oats.nutrients, sodium: 0.4 } });
    methods.add_diary_entry({ date: today(), kind: "food", ref_id: id, amount: 1 });
    show(["diary"]);

    expect(await screen.findByText("1 g / 6 g")).toBeTruthy();
    expect(screen.queryByText("Sodium")).toBeNull();
  });

  it("groups the day by meal with each meal's part of the energy, logs into the meal picked and moves an entry", async () => {
    const { methods, calls } = start({ "diet.target_calories": 2000 });
    const id = methods.save_food(oats);
    methods.add_diary_entry({ date: today(), kind: "food", ref_id: id, amount: 1, meal: "breakfast" });
    methods.add_diary_entry({ date: today(), kind: "food", ref_id: id, amount: 2, meal: "dinner" });
    show(["diary"]);

    expect(await screen.findByRole("heading", { name: "Meals" })).toBeTruthy();
    const table = screen.getByRole("table", { name: "Each meal" });
    // Breakfast's 380 kcal is a third of the day and its target is 25% of 2000 kcal.
    const breakfast = within(table).getByRole("row", { name: /Breakfast/ });
    expect(within(breakfast).getByText("33%")).toBeTruthy();
    expect(within(breakfast).getByText("500 kcal (25%)")).toBeTruthy();
    expect(screen.getByText("Dinner · 760 kcal")).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox", { name: "Meal" }), { target: { value: "snacks" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Food" }), { target: { value: id } });
    fireEvent.click(screen.getByRole("button", { name: "Log" }));
    expect(await screen.findByText("Snacks · 380 kcal")).toBeTruthy();
    expect(calls.add_diary_entry).toHaveBeenLastCalledWith(expect.objectContaining({ meal: "snacks" }));

    const [dinner_entry] = methods.get_diary_day(today()).entries.filter((entry) => entry.meal === "dinner");
    fireEvent.change(screen.getAllByRole("combobox", { name: "Meal of Oats (Quaker)" })[1]!, { target: { value: "lunch" } });
    await waitFor(() => expect(calls.move_diary_entry).toHaveBeenCalledWith(dinner_entry!.id, "lunch"));
    expect(await screen.findByText("Lunch · 760 kcal")).toBeTruthy();
  });

  it("removes an entry with an Undo that puts it back", async () => {
    const { methods } = start();
    const id = methods.save_food(oats);
    methods.add_diary_entry({ date: today(), kind: "food", ref_id: id, amount: 1 });
    show([]);

    fireEvent.click(await screen.findByRole("button", { name: "Remove Oats (Quaker)" }));
    expect(await screen.findByText("Nothing logged for this day.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("cell", { name: "Oats (Quaker)" })).toBeTruthy();
    expect(methods.get_diary_day(today()).entries).toHaveLength(1);
  });

  it("shows energy in kJ when Settings asks for it", async () => {
    const { methods } = start({ energy_unit: "kJ", "diet.target_calories": 0 });
    const id = methods.save_food(oats);
    methods.add_diary_entry({ date: today(), kind: "food", ref_id: id, amount: 1 });
    show(["diary"]);
    // The day's meter, its meal's row and the entry's row.
    expect(await screen.findAllByText("1,590 kJ")).toHaveLength(3);
  });
});

describe("diet foods and recipes", () => {
  it("adds a food from an Open Food Facts lookup and lists it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ products: [{ code: "301", product_name: "Peanut Butter", brands: "Nutty", nutriments: { "energy-kcal_100g": 600, proteins_100g: 25, sodium_100g: 0.4, "vitamin-e_100g": 0.009 } }] }))),
    );
    const { methods } = start();
    show(["foods"]);

    fireEvent.click(await screen.findByRole("button", { name: "Add food" }));
    expect(screen.getByText("Set a USDA FoodData Central API key in Settings to also search USDA.")).toBeTruthy();
    const search = screen.getByRole("searchbox", { name: "Search Open Food Facts" });
    fireEvent.change(search, { target: { value: "peanut butter" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use Peanut Butter" }));

    expect((screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("Peanut Butter");
    expect((screen.getByRole("textbox", { name: "Calories" }) as HTMLInputElement).value).toBe("600");
    expect((screen.getByRole("textbox", { name: "Sodium" }) as HTMLInputElement).value).toBe("400");
    expect((screen.getByRole("textbox", { name: "Vitamin E" }) as HTMLInputElement).value).toBe("9");
    type_number(screen.getByRole("textbox", { name: "Selenium" }), "4.1");
    const categories = screen.getByRole("combobox", { name: "Categories" });
    fireEvent.focus(categories);
    fireEvent.change(categories, { target: { value: "Spreads" } });
    fireEvent.keyDown(categories, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("cell", { name: "Peanut Butter" })).toBeTruthy();
    const { foods: [food], categories: [spreads] } = methods.get_diet();
    expect(spreads).toMatchObject({ name: "Spreads", parent_id: null });
    expect(food).toMatchObject({ name: "Peanut Butter", categories: [spreads!.id], serving_size: 100, serving_unit: "g" });
    expect(food!.nutrients.sodium).toBeCloseTo(0.4);
    expect(food!.nutrients.vitamin_e).toBeCloseTo(0.009);
    expect(food!.nutrients.selenium).toBeCloseTo(0.0000041, 10);
  });

  it("works out a recipe's nutrition per serving from its ingredients as they are added", async () => {
    const { methods } = start();
    const id = methods.save_food(oats);
    show(["recipes"]);

    fireEvent.click(await screen.findByRole("button", { name: "Add recipe" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Porridge" } });
    type_number(screen.getByRole("textbox", { name: "Servings" }), "2");
    fireEvent.change(screen.getByRole("combobox", { name: "Ingredient to add" }), { target: { value: id } });
    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    expect(screen.getByRole("status", { name: "Per serving" }).textContent).toBe("Per serving: 190 kcal, 6.5 g protein, 30 g carbs, 3.5 g fat");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("cell", { name: "Porridge" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "190 kcal" })).toBeTruthy();
    expect(methods.get_diet().recipes[0]).toMatchObject({ name: "Porridge", servings: 2, ingredients: [{ food_id: id, amount: 100, unit: "g" }] });
  });

  it("steps into nested categories to filter foods, climbs back by the trail, and groups them under their paths", async () => {
    const { methods } = start();
    methods.save_food({ ...oats, name: "Chicken", brand: "", categories: ["Protein/Meat"] });
    methods.save_food({ ...oats, name: "Apple", brand: "", categories: [] });
    show(["foods"]);

    await screen.findByRole("cell", { name: "Apple" });
    const filter = screen.getByRole("group", { name: "Filter by category" });
    const trail = () => within(filter).getByRole("navigation", { name: "Breadcrumb" }).textContent;
    expect([...screen.getByRole("table").querySelectorAll("td .tree-path")].map((path) => path.textContent)).toEqual(["Protein › Meat"]);
    fireEvent.click(within(filter).getByRole("button", { name: "Protein (1)" }));
    fireEvent.click(within(filter).getByRole("button", { name: "Meat (1)" }));
    expect(trail()).toBe("All categories › Protein › Meat");
    expect(screen.queryByRole("cell", { name: "Apple" })).toBeNull();
    expect(screen.getByRole("cell", { name: "Chicken" })).toBeTruthy();

    fireEvent.click(within(filter).getByRole("button", { name: "Protein" }));
    expect(trail()).toBe("All categories › Protein");
    fireEvent.click(within(filter).getByRole("button", { name: "All categories" }));
    fireEvent.click(within(filter).getByRole("button", { name: "(uncategorized) (1)" }));
    expect(screen.getByRole("cell", { name: "Apple" })).toBeTruthy();
    expect(screen.queryByRole("cell", { name: "Chicken" })).toBeNull();

    fireEvent.click(within(filter).getByRole("button", { name: "All categories" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Group by category" }));
    const headings = [...screen.getByRole("table").querySelectorAll(".tree-path")].map((path) => path.textContent);
    expect(headings).toEqual(expect.arrayContaining(["Protein", "Protein › Meat", "(uncategorized)"]));
  });

  it("asks before deleting a food", async () => {
    const { methods } = start();
    methods.save_food(oats);
    show(["foods"]);
    fireEvent.click(await screen.findByRole("button", { name: "Delete Oats (Quaker)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByText("No foods yet.")).toBeTruthy();
  });
});

describe("diet grocery, categories and units", () => {
  it("adds a grocery line with the food's comment when Settings asks, and clears it once bought", async () => {
    const { methods } = start({ "diet.prefill_grocery_comment": true });
    const id = methods.save_food(oats);
    show(["grocery"]);

    fireEvent.change(await screen.findByRole("combobox", { name: "Food" }), { target: { value: id } });
    expect((screen.getByRole("textbox", { name: "Comment" }) as HTMLInputElement).value).toBe("Big bag");
    expect((screen.getByRole("combobox", { name: "Brand" }) as HTMLInputElement).value).toBe("Quaker");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    fireEvent.click(await screen.findByRole("checkbox", { name: "Bought Oats" }));
    fireEvent.click(await screen.findByRole("button", { name: "Clear checked (1)" }));
    expect(await screen.findByText("Nothing on the list.")).toBeTruthy();
    expect(methods.get_diet().grocery).toEqual([]);
  });

  it("opens categories like folders, adds one inside, renames and moves them, and refuses to delete a unit in use", async () => {
    const { methods } = start();
    methods.save_food({ ...oats, categories: ["Grains"] });
    const carbs = methods.add_category("Carbs");
    const paths = () => methods.get_diet().categories.map((category) => category.path.join("/"));
    show(["categories"]);

    fireEvent.click(await screen.findByRole("button", { name: "Rename Grains" }));
    const field = screen.getByRole("textbox", { name: "Rename Grains" });
    fireEvent.change(field, { target: { value: "Cereals" } });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.click(await screen.findByRole("button", { name: "Move Cereals" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Move into" }), { target: { value: carbs } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Move" }));
    await waitFor(() => expect(paths()).toEqual(["Carbs", "Carbs/Cereals"]));
    expect(methods.get_diet().foods[0]!.categories).toEqual([methods.get_diet().categories[1]!.id]);

    fireEvent.click(await screen.findByRole("button", { name: "Carbs" }));
    expect(screen.getByRole("navigation", { name: "Breadcrumb" }).textContent).toBe("All categories › Carbs");
    expect(screen.getByRole("cell", { name: "Cereals" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "New category in Carbs" }), { target: { value: "Bread" } });
    fireEvent.click(screen.getByRole("button", { name: "Add category" }));
    await waitFor(() => expect(paths()).toEqual(["Carbs", "Carbs/Cereals", "Carbs/Bread"]));
    fireEvent.click(screen.getByRole("button", { name: "All categories" }));
    expect(await screen.findByText("(2 inside)")).toBeTruthy();

    cleanup();
    show(["units"]);
    fireEvent.click(await screen.findByRole("button", { name: "Delete g" }));
    expect(await screen.findByText(/"g" is still used by 1 food\(s\)/)).toBeTruthy();
  });

  it("fits the food and grocery tables to the page with each row's actions in their own fixed column", async () => {
    const { methods } = start();
    const id = methods.save_food({ ...oats, comment: "https://fdc.nal.usda.gov/fdc-app.html#/food-details/2345678/nutrients" });
    methods.add_grocery_item({ food_id: id, amount: 1 });

    show(["foods"]);
    const row = (await screen.findByRole("cell", { name: "Oats" })).closest("tr")!;
    expect(within(row).getByRole("button", { name: "Edit Oats (Quaker)" })).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Delete Oats (Quaker)" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Comment" })).toBeNull();
    const foods = screen.getByRole("table");
    expect(foods.parentElement!.classList.contains("fit")).toBe(true);
    expect(within(foods).getAllByRole("columnheader").at(-1)!.style.width).toBe("150px");

    cleanup();
    show(["grocery"]);
    const line = (await screen.findByRole("checkbox", { name: "Bought Oats" })).closest("tr")!;
    expect(within(line).getByRole("button", { name: "Remove Oats" })).toBeTruthy();
    const grocery = screen.getByRole("table");
    expect(grocery.parentElement!.classList.contains("fit")).toBe(true);
    expect(within(grocery).getAllByRole("columnheader").at(-1)!.style.width).toBe("100px");
  });
});

describe("diet settings", () => {
  it("renames, reorders, adds and removes meals", async () => {
    const { methods } = start();
    render(<SettingsView />);

    const name = await screen.findByRole("textbox", { name: "Snacks name" });
    fireEvent.change(name, { target: { value: "Treats" } });
    fireEvent.blur(name);
    await waitFor(() => expect((methods.get_settings()["diet.meals"] as { name: string }[]).map((meal) => meal.name)).toEqual(["Breakfast", "Lunch", "Dinner", "Treats"]));

    fireEvent.click(screen.getByRole("button", { name: "Add meal" }));
    await waitFor(() => expect(methods.get_settings()["diet.meals"]).toHaveLength(5));
    fireEvent.click(await screen.findByRole("button", { name: "Remove Meal 5" }));
    await waitFor(() => expect(methods.get_settings()["diet.meals"]).toHaveLength(4));
  });

  it("leaves the targets the plan follows to the plan, with no reset", async () => {
    start({ "calculators.follow_diet_targets": true, "diet.target_protein": 140, "diet.target_iron": 0.02 });
    render(<SettingsView />);

    expect(((await screen.findByRole("textbox", { name: "Protein target" })) as HTMLInputElement).value).toBe("140");
    // Only protein has a value from the plan; without body readings the rest still follow the preset.
    expect(screen.getAllByText("Set by the plan on Goals.")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Reset Protein target" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reset Iron target" })).toBeTruthy();
    expect(screen.getByText("Custom: 1 target(s) set by hand.")).toBeTruthy();
  });

  it("saves targets in the stored units", async () => {
    const { methods } = start();
    render(
      <>
        <SettingsView />
        <Toasts />
      </>,
    );

    const sodium = await screen.findByRole("textbox", { name: "Sodium target" });
    expect((sodium as HTMLInputElement).value).toBe("2300");
    type_number(sodium, "1500");
    await waitFor(() => expect(methods.get_settings()["diet.target_sodium"]).toBeCloseTo(1.5));

    const vitamin_d = screen.getByRole("textbox", { name: "Vitamin D target" });
    expect((vitamin_d as HTMLInputElement).value).toBe("20");
    type_number(vitamin_d, "25");
    await waitFor(() => expect(methods.get_settings()["diet.target_vitamin_d"]).toBeCloseTo(0.000025, 10));
    fireEvent.click(await screen.findByRole("button", { name: "Reset Vitamin D target" }));
    await waitFor(() => expect(methods.get_settings()["diet.target_vitamin_d"]).toBeNull());

    fireEvent.change(screen.getByRole("combobox", { name: "Targets" }), { target: { value: "eu" } });
    await waitFor(() => expect((screen.getByRole("textbox", { name: "Vitamin D target" }) as HTMLInputElement).value).toBe("5"));

    fireEvent.click(screen.getByRole("switch", { name: "Show Magnesium" }));
    await waitFor(() => expect(methods.get_settings()["diet.shown"]).toEqual({ magnesium: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Reset to label" }));
    await waitFor(() => expect(methods.get_settings()["diet.shown"]).toEqual({}));

  });
});
