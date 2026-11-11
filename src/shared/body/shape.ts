// The 3D body: MakeHuman's CC0 body mesh, morphed by its sex, muscle, weight, height and girth targets until its height,
// mass and girths match the readings. The model's lengths are in decimetres, so a cubic unit is a litre.

// ── Roles ────────────────────────────────────────────────────────────────────

// What a metric tells the 3D body; a girth is measured round the model at the same place as on the body.
export type ShapeRole = "" | "body_fat" | "neck" | "chest" | "underbust" | "waist" | "hips" | "upper_arm" | "wrist" | "thigh" | "knee" | "calf" | "ankle";

export type Girth = Exclude<ShapeRole, "" | "body_fat">;

export const shape_roles: { key: ShapeRole; label: string }[] = [
  { key: "", label: "Nothing" },
  { key: "body_fat", label: "Body fat" },
  { key: "neck", label: "Neck girth" },
  { key: "chest", label: "Chest girth" },
  { key: "underbust", label: "Underbust girth" },
  { key: "waist", label: "Waist girth" },
  { key: "hips", label: "Hip girth" },
  { key: "upper_arm", label: "Upper arm girth" },
  { key: "wrist", label: "Wrist girth" },
  { key: "thigh", label: "Thigh girth" },
  { key: "knee", label: "Knee girth" },
  { key: "calf", label: "Calf girth" },
  { key: "ankle", label: "Ankle girth" },
];

export const girths = shape_roles.map((role) => role.key).filter((key): key is Girth => key !== "" && key !== "body_fat");

export function role_of(role: unknown): ShapeRole {
  return shape_roles.find((candidate) => candidate.key === role)?.key ?? "";
}

// The name MakeHuman gives each girth's targets.
const girth_targets: Record<Girth, string> = {
  neck: "neck",
  chest: "bust",
  underbust: "underbust",
  waist: "waist",
  hips: "hips",
  upper_arm: "upperarm",
  wrist: "wrist",
  thigh: "thigh",
  knee: "knee",
  calf: "calf",
  ankle: "ankle",
};

export const girth_names = Object.values(girth_targets);

// The vertices a tape follows round each girth, from MakeHuman's measurement plugin.
const girth_loops: Record<Girth, number[]> = {
  neck: [7514, 10358, 7631, 7496, 7488, 7489, 7474, 7475, 7531, 7537, 7543, 7549, 7555, 7561, 7743, 7722, 856, 1030, 1051, 850, 844, 838, 832, 826, 820, 756, 755, 770, 769, 777, 929, 3690, 804, 800, 808, 801, 799, 803, 7513, 7515, 7521, 7514],
  chest: [8439, 8455, 8462, 8446, 8478, 8494, 8557, 8510, 8526, 8542, 10720, 10601, 10603, 10602, 10612, 10611, 10610, 10613, 10604, 10605, 10606, 3942, 3941, 3940, 3950, 3947, 3948, 3949, 3938, 3939, 3937, 4065, 1870, 1854, 1838, 1885, 1822, 1806, 1774, 1790, 1783, 1767, 1799, 8471],
  underbust: [10750, 10744, 10724, 10725, 10748, 10722, 10640, 10642, 10641, 10651, 10650, 10649, 10652, 10643, 10644, 10645, 10646, 10647, 10648, 3988, 3987, 3986, 3985, 3984, 3983, 3982, 3992, 3989, 3990, 3991, 3980, 3981, 3979, 4067, 4098, 4073, 4072, 4094, 4100, 4082, 4088],
  waist: [4121, 10760, 10757, 10777, 10776, 10779, 10780, 10778, 10781, 10771, 10773, 10772, 10775, 10774, 10814, 10834, 10816, 10817, 10818, 10819, 10820, 10821, 4181, 4180, 4179, 4178, 4177, 4176, 4175, 4196, 4173, 4131, 4132, 4129, 4130, 4128, 4138, 4135, 4137, 4136, 4133, 4134, 4108, 4113, 4118, 4121],
  hips: [4341, 10968, 10969, 10971, 10970, 10967, 10928, 10927, 10925, 10926, 10923, 10924, 10868, 10875, 10861, 10862, 4228, 4227, 4226, 4242, 4234, 4294, 4293, 4296, 4295, 4297, 4298, 4342, 4345, 4346, 4344, 4343, 4361, 4341],
  upper_arm: [8383, 8393, 8392, 8391, 8390, 8394, 8395, 8399, 10455, 10516, 8396, 8397, 8398, 8388, 8387, 8386, 10431, 8385, 8384, 8389],
  wrist: [10208, 10211, 10212, 10216, 10471, 10533, 10213, 10214, 10215, 10205, 10204, 10203, 10437, 10202, 10201, 10206, 10200, 10210, 10209, 10208],
  thigh: [11071, 11080, 11081, 11086, 11076, 11077, 11074, 11075, 11072, 11073, 11069, 11070, 11087, 11085, 11084, 12994, 11083, 11082, 11079, 11071],
  knee: [11223, 11230, 11232, 11233, 11238, 11228, 11229, 11226, 11227, 11224, 11225, 11221, 11222, 11239, 11237, 11236, 13002, 11235, 11234, 11223],
  calf: [11339, 11336, 11353, 11351, 11350, 13008, 11349, 11348, 11345, 11337, 11344, 11346, 11347, 11352, 11342, 11343, 11340, 11341, 11338, 11339],
  ankle: [11460, 11464, 11458, 11459, 11419, 11418, 12958, 12965, 12960, 12963, 12961, 12962, 12964, 12927, 13028, 12957, 11463, 11461, 11457, 11460],
};

// ── Targets ──────────────────────────────────────────────────────────────────

export const sexes = ["female", "male"] as const;
const levels = ["min", "average", "max"] as const;

type Level = (typeof levels)[number];

export function universal_targets(): string[] {
  return sexes.flatMap((sex) => levels.flatMap((muscle) => levels.map((weight) => `universal-${sex}-young-${muscle}muscle-${weight}weight`)));
}

export function height_targets(): string[] {
  return sexes.flatMap((sex) => levels.flatMap((muscle) => levels.flatMap((weight) => ["min", "max"].map((height) => `${sex}-young-${muscle}muscle-${weight}weight-${height}height`))));
}

// How much of the min, average and max targets a slider from 0 to 1 takes, as MakeHuman blends them.
function level_weights(value: number): Record<Level, number> {
  const min = Math.max(0, 1 - value * 2);
  const max = Math.max(0, value * 2 - 1);
  return { min, average: 1 - min - max, max };
}

// ── Model ────────────────────────────────────────────────────────────────────

export interface Target {
  indices: Uint32Array;
  // Three numbers per index.
  moves: Float32Array;
}

export interface BodyModel {
  positions: Float32Array;
  // Four vertex numbers per face; a triangle repeats its last.
  faces: Uint32Array;
  targets: Map<string, Target>;
}

// Reads body_model.bin as scripts/build_body_model.ts writes it.
export function parse_body_model(buffer: ArrayBuffer): BodyModel {
  const view = new DataView(buffer);
  let offset = 0;
  const u8 = () => view.getUint8(offset++);
  const u16 = () => ((offset += 2), view.getUint16(offset - 2, true));
  const i16 = () => ((offset += 2), view.getInt16(offset - 2, true));
  const u32 = () => ((offset += 4), view.getUint32(offset - 4, true));
  const f32 = () => ((offset += 4), view.getFloat32(offset - 4, true));

  const magic = String.fromCharCode(u8(), u8(), u8(), u8());
  if (magic !== "XFBM" || u32() !== 1) throw new Error("Not a body model");
  const vertex_count = u32();
  const face_count = u32();
  const positions = new Float32Array(vertex_count * 3);
  for (let index = 0; index < positions.length; index++) positions[index] = f32();
  const faces = new Uint32Array(face_count * 4);
  for (let index = 0; index < faces.length; index++) faces[index] = u16();

  const targets = new Map<string, Target>();
  const target_count = u32();
  for (let target = 0; target < target_count; target++) {
    const name = new TextDecoder().decode(new Uint8Array(buffer, offset + 1, view.getUint8(offset)));
    offset += 1 + view.getUint8(offset);
    const scale = f32();
    const entry_count = u32();
    const indices = new Uint32Array(entry_count);
    for (let index = 0; index < entry_count; index++) indices[index] = u16();
    const moves = new Float32Array(entry_count * 3);
    for (let index = 0; index < moves.length; index++) moves[index] = i16() * scale;
    targets.set(name, { indices, moves });
  }
  return { positions, faces, targets };
}

// The same model kept to some of its vertices, numbered afresh in the order given, so measuring them is quick.
function part_of(model: BodyModel, vertices: number[]): BodyModel {
  const renumbered = new Map(vertices.map((vertex, index) => [vertex, index]));
  const positions = new Float32Array(vertices.length * 3);
  vertices.forEach((vertex, index) => positions.set(model.positions.subarray(vertex * 3, vertex * 3 + 3), index * 3));
  const targets = new Map<string, Target>();
  for (const [name, target] of model.targets) {
    const indices: number[] = [];
    const moves: number[] = [];
    target.indices.forEach((vertex, entry) => {
      const local = renumbered.get(vertex);
      if (local === undefined) return;
      indices.push(local);
      moves.push(target.moves[entry * 3]!, target.moves[entry * 3 + 1]!, target.moves[entry * 3 + 2]!);
    });
    if (indices.length) targets.set(name, { indices: Uint32Array.from(indices), moves: Float32Array.from(moves) });
  }
  return { positions, faces: new Uint32Array(), targets };
}

// ── Shape ────────────────────────────────────────────────────────────────────

export interface ShapeParameters {
  // 0 female, 1 male, between them a mix.
  sex: number;
  // Each from 0 to 1, 0.5 being average.
  muscle: number;
  weight: number;
  height: number;
  // Each from -1 to 1, 0 leaving the girth as the rest of the shape makes it.
  girths: Partial<Record<Girth, number>>;
}

export const average_shape: ShapeParameters = { sex: 0.5, muscle: 0.5, weight: 0.5, height: 0.5, girths: {} };

// How much of each target the parameters take; targets left out take none.
export function target_weights(parameters: ShapeParameters): Map<string, number> {
  const weights = new Map<string, number>();
  const muscle = level_weights(parameters.muscle);
  const weight = level_weights(parameters.weight);
  const height = level_weights(parameters.height);
  for (const sex of sexes) {
    const sex_share = sex === "male" ? parameters.sex : 1 - parameters.sex;
    if (sex_share <= 0) continue;
    weights.set(`${sex}-young`, sex_share);
    for (const muscle_level of levels) {
      for (const weight_level of levels) {
        const share = sex_share * muscle[muscle_level] * weight[weight_level];
        if (share <= 0) continue;
        weights.set(`universal-${sex}-young-${muscle_level}muscle-${weight_level}weight`, share);
        for (const height_level of ["min", "max"] as const) {
          if (height[height_level] > 0) weights.set(`${sex}-young-${muscle_level}muscle-${weight_level}weight-${height_level}height`, share * height[height_level]);
        }
      }
    }
  }
  for (const [girth, value] of Object.entries(parameters.girths) as [Girth, number][]) {
    if (value) weights.set(`measure-${girth_targets[girth]}-circ-${value < 0 ? "decr" : "incr"}`, Math.abs(value));
  }
  return weights;
}

// The model's vertices for the parameters, written into the array given when there is one.
export function shape_positions(model: BodyModel, parameters: ShapeParameters, into?: Float32Array): Float32Array {
  const positions = into ?? new Float32Array(model.positions.length);
  positions.set(model.positions);
  for (const [name, share] of target_weights(parameters)) {
    const target = model.targets.get(name);
    if (!target) continue;
    for (let entry = 0; entry < target.indices.length; entry++) {
      const at = target.indices[entry]! * 3;
      for (let axis = 0; axis < 3; axis++) positions[at + axis] = positions[at + axis]! + target.moves[entry * 3 + axis]! * share;
    }
  }
  return positions;
}

// ── Measuring ────────────────────────────────────────────────────────────────

// From the soles to the top of the head, in cm.
export function height_of_positions(positions: Float32Array): number {
  let lowest = Infinity;
  let highest = -Infinity;
  for (let index = 1; index < positions.length; index += 3) {
    lowest = Math.min(lowest, positions[index]!);
    highest = Math.max(highest, positions[index]!);
  }
  return (highest - lowest) * 10;
}

// The space the skin closes in, in litres.
export function volume_of_positions(model: BodyModel, positions: Float32Array): number {
  let volume = 0;
  const corner = (vertex: number) => [positions[vertex * 3]!, positions[vertex * 3 + 1]!, positions[vertex * 3 + 2]!] as const;
  const add_triangle = (first: number, second: number, third: number) => {
    const [ax, ay, az] = corner(first);
    const [bx, by, bz] = corner(second);
    const [cx, cy, cz] = corner(third);
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  };
  for (let face = 0; face < model.faces.length; face += 4) {
    const [first, second, third, fourth] = [model.faces[face]!, model.faces[face + 1]!, model.faces[face + 2]!, model.faces[face + 3]!];
    add_triangle(first, second, third);
    if (fourth !== third) add_triangle(first, third, fourth);
  }
  return Math.abs(volume);
}

// The length of a closed loop through the vertices given in order, in cm.
function loop_length(positions: Float32Array, count: number): number {
  let length = 0;
  for (let index = 0; index < count; index++) {
    const from = index * 3;
    const to = ((index + 1) % count) * 3;
    length += Math.hypot(positions[to]! - positions[from]!, positions[to + 1]! - positions[from + 1]!, positions[to + 2]! - positions[from + 2]!);
  }
  return length * 10;
}

function loop_vertices(girth: Girth): number[] {
  const loop = girth_loops[girth];
  return [...new Set(loop)];
}

export function girth_of_positions(positions: Float32Array, girth: Girth): number {
  const vertices = loop_vertices(girth);
  const picked = new Float32Array(vertices.length * 3);
  vertices.forEach((vertex, index) => picked.set(positions.subarray(vertex * 3, vertex * 3 + 3), index * 3));
  return loop_length(picked, vertices.length);
}

// Body density in kg per litre from body fat, by Siri's equation.
export function body_density(body_fat: number): number {
  return 495 / (body_fat + 450);
}

function lowest_of(positions: Float32Array): number {
  let lowest = Infinity;
  for (let index = 1; index < positions.length; index += 3) lowest = Math.min(lowest, positions[index]!);
  return lowest;
}

// How far, in cm, each vertex of a body lies outside (above 0) or inside (below 0) another along its normal, both standing on the floor.
export function change_of_positions(positions: Float32Array, other: Float32Array, normals: Float32Array): Float32Array {
  const lift = lowest_of(other) - lowest_of(positions);
  const change = new Float32Array(positions.length / 3);
  for (let vertex = 0; vertex < change.length; vertex += 1) {
    let along = 0;
    for (let axis = 0; axis < 3; axis += 1) {
      const at = vertex * 3 + axis;
      along += (positions[at]! - other[at]! + (axis === 1 ? lift : 0)) * normals[at]!;
    }
    change[vertex] = along * 10;
  }
  return change;
}

// ── Fitting ──────────────────────────────────────────────────────────────────

export interface BodyMeasures {
  // "" when not set, which mixes the two.
  sex: "" | "female" | "male";
  // In cm, kg and percent; 0 when not known.
  height: number;
  mass: number;
  body_fat: number;
  // In cm.
  girths: Partial<Record<Girth, number>>;
}

// Both sets of measures, each taking a reading only the other holds as unchanged, so two days differ only where both were measured.
export function shared_measures(first: BodyMeasures, second: BodyMeasures): [BodyMeasures, BodyMeasures] {
  const names = [...new Set([...Object.keys(first.girths), ...Object.keys(second.girths)])] as Girth[];
  const fill = (measures: BodyMeasures, other: BodyMeasures): BodyMeasures => ({
    ...measures,
    mass: measures.mass || other.mass,
    body_fat: measures.body_fat || other.body_fat,
    girths: Object.fromEntries(names.map((name) => [name, measures.girths[name] || other.girths[name] || 0])),
  });
  return [fill(first, second), fill(second, first)];
}

export interface FitLine {
  // A girth, or "height" or "mass".
  name: Girth | "height" | "mass";
  wanted: number;
  reached: number;
}

export interface BodyFit {
  parameters: ShapeParameters;
  // Each reading the shape was fitted to, and how near it came; a shape can go only so far.
  lines: FitLine[];
}

// The body fat most adults of each sex carry, in percent.
function usual_body_fat(sex: number): number {
  return 28 - sex * 10;
}

// Muscle from lean mass for the height, or from body fat when the mass or height is missing.
function muscle_from(measures: BodyMeasures, sex: number): number {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  if (measures.body_fat > 0 && measures.mass > 0 && measures.height > 0) {
    const lean_index = (measures.mass * (1 - measures.body_fat / 100)) / (measures.height / 100) ** 2;
    const usual_lean_index = 15 + sex * 4;
    return clamp(0.5 + (lean_index - usual_lean_index) / 8);
  }
  if (measures.body_fat > 0) return clamp(0.5 + (usual_body_fat(sex) - measures.body_fat) / 30);
  return 0.5;
}

// The value between the bounds where a rising measure reaches the goal, by halving.
function solve(low: number, high: number, measure: (value: number) => number, goal: number): number {
  if (measure(low) >= goal) return low;
  if (measure(high) <= goal) return high;
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    if (measure(middle) < goal) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

// The shape whose height, mass and girths come nearest the measures, each pass refining the others' fit.
export function fit_shape(model: BodyModel, measures: BodyMeasures): BodyFit {
  const sex = measures.sex === "female" ? 0 : measures.sex === "male" ? 1 : 0.5;
  const parameters: ShapeParameters = { sex, muscle: muscle_from(measures, sex), weight: 0.5, height: 0.5, girths: {} };
  const positions = new Float32Array(model.positions.length);
  const wanted_girths = (Object.entries(measures.girths) as [Girth, number][]).filter(([, value]) => value > 0);
  const loops = new Map(wanted_girths.map(([girth]) => [girth, part_of(model, loop_vertices(girth))]));
  const density = body_density(measures.body_fat > 0 ? measures.body_fat : usual_body_fat(sex));
  const height_at = () => height_of_positions(shape_positions(model, parameters, positions));
  const mass_at = () => volume_of_positions(model, shape_positions(model, parameters, positions)) * density;
  const girth_at = (girth: Girth) => {
    const loop = loops.get(girth)!;
    return loop_length(shape_positions(loop, parameters), loop.positions.length / 3);
  };

  for (let pass = 0; pass < 3; pass++) {
    if (measures.height > 0) parameters.height = solve(0, 1, (value) => ((parameters.height = value), height_at()), measures.height);
    if (measures.mass > 0) parameters.weight = solve(0, 1, (value) => ((parameters.weight = value), mass_at()), measures.mass);
    for (const [girth, wanted] of wanted_girths) {
      parameters.girths[girth] = solve(-1, 1, (value) => ((parameters.girths[girth] = value), girth_at(girth)), wanted);
    }
  }

  const lines: FitLine[] = [];
  if (measures.height > 0) lines.push({ name: "height", wanted: measures.height, reached: height_at() });
  if (measures.mass > 0) lines.push({ name: "mass", wanted: measures.mass, reached: mass_at() });
  for (const [girth, wanted] of wanted_girths) lines.push({ name: girth, wanted, reached: girth_at(girth) });
  return { parameters, lines };
}
