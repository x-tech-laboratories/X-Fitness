import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { average_shape, fit_shape, girth_of_positions, height_of_positions, parse_body_model, shape_positions, volume_of_positions } from "../src/shared/body/shape.ts";

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

  it("stops at the furthest shape it can make and says how near it came", () => {
    const fit = fit_shape(model, { sex: "female", height: 165, mass: 0, body_fat: 0, girths: { wrist: 40 } });
    const wrist = fit.lines.find((line) => line.name === "wrist")!;

    expect(fit.parameters.girths.wrist).toBe(1);
    expect(wrist.reached).toBeLessThan(40);
  });
});
