import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { average_shape, change_of_positions, shared_measures, fit_shape, heaviest_weight, girth_of_positions, height_of_positions, parse_body_model, shape_positions, volume_of_positions } from "../src/shared/body/shape.ts";

const file = readFileSync(new URL("../src/web/body/body_model.bin", import.meta.url));
const model = parse_body_model(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

describe("the 3D body", () => {
  it("is an adult of usual size before it is fitted", () => {
    const positions = shape_positions(model, average_shape);

    expect(height_of_positions(positions)).toBeGreaterThan(155);
    expect(height_of_positions(positions)).toBeLessThan(180);
    expect(volume_of_positions(model, positions)).toBeGreaterThan(45);
    expect(girth_of_positions(positions, "waist")).toBeGreaterThan(60);
    expect(girth_of_positions(positions, "waist")).toBeLessThan(90);
  });

  it("grows wider with weight and taller with height", () => {
    const light = shape_positions(model, { ...average_shape, weight: 0 });
    const heavy = shape_positions(model, { ...average_shape, weight: 1 });
    const tall = shape_positions(model, { ...average_shape, height: 1 });

    expect(girth_of_positions(heavy, "waist")).toBeGreaterThan(girth_of_positions(light, "waist") + 10);
    expect(height_of_positions(tall)).toBeGreaterThan(height_of_positions(light) + 30);
  });

  it("fits the height, mass and girths it is given", () => {
    const fit = fit_shape(model, { sex: "male", height: 180, mass: 85, body_fat: 18, girths: { waist: 88, chest: 102, upper_arm: 34 } });

    expect(fit.parameters.sex).toBe(1);
    for (const line of fit.lines) expect(Math.abs(line.reached - line.wanted) / line.wanted).toBeLessThan(0.01);
  });

  it("reads lean mass that comes with extra fat as less muscle, and keeps the full muscle for a lean, heavy build", () => {
    const heavy = fit_shape(model, { sex: "male", height: 186.69, mass: 108.86, body_fat: 28, girths: {} });
    const built = fit_shape(model, { sex: "male", height: 180, mass: 92, body_fat: 12, girths: {} });
    const usual = fit_shape(model, { sex: "male", height: 180, mass: 75, body_fat: 18, girths: {} });

    expect(heavy.parameters.muscle).toBeGreaterThan(0.55);
    expect(heavy.parameters.muscle).toBeLessThan(0.7);
    expect(built.parameters.muscle).toBeGreaterThan(0.9);
    expect(usual.parameters.muscle).toBeCloseTo(0.5, 1);
  });

  it("goes on past the heaviest target to reach a mass the targets alone fall short of", () => {
    const fit = fit_shape(model, { sex: "male", height: 186.69, mass: 108.86, body_fat: 28, girths: {} });

    expect(fit.parameters.weight).toBeGreaterThan(1);
    expect(fit.parameters.weight).toBeLessThan(heaviest_weight);
    expect(fit.lines.find((line) => line.name === "mass")!.reached).toBeCloseTo(108.86, 0);
  });

  it("stops at the furthest shape it can make and says how near it came", () => {
    const fit = fit_shape(model, { sex: "female", height: 165, mass: 0, body_fat: 0, girths: { wrist: 40 } });
    const wrist = fit.lines.find((line) => line.name === "wrist")!;

    expect(fit.parameters.girths.wrist).toBe(1);
    expect(wrist.reached).toBeLessThan(40);
  });

  it("measures how far each point of one body lies outside or inside another, both standing on the floor", () => {
    // A sole on the floor and a point 1 dm out to the side, in a body standing 1 dm higher than the other.
    const positions = new Float32Array([0, 1, 0, 1.5, 2, 0]);
    const other = new Float32Array([0, 0, 0, 1, 1, 0]);
    const normals = new Float32Array([0, -1, 0, 1, 0, 0]);
    expect([...change_of_positions(positions, other, normals)]).toEqual([0, 5]);

    // Any normals do for a body against itself, so its own positions stand in for them.
    const usual = shape_positions(model, average_shape);
    expect(change_of_positions(usual, usual, usual).every((change) => change === 0)).toBe(true);
  });

  it("takes a reading only one of two days has as unchanged on the other", () => {
    const now = { sex: "male" as const, height: 180, mass: 88, body_fat: 24, girths: { waist: 97, chest: 104 } };
    const then = { sex: "male" as const, height: 180, mass: 92, body_fat: 0, girths: { waist: 101, chest: 0 } };
    expect(shared_measures(now, then)).toEqual([
      { sex: "male", height: 180, mass: 88, body_fat: 24, girths: { waist: 97, chest: 104 } },
      { sex: "male", height: 180, mass: 92, body_fat: 24, girths: { waist: 101, chest: 104 } },
    ]);
  });
});
