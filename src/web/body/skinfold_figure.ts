// The human figure the skinfold pictures are drawn on: a standing body seven and a half heads tall, arms held a little
// away from the sides, as SVG paths in a frame where the head's top is y 0, the soles y 750 and the middle x 0.

// ── Geometry ─────────────────────────────────────────────────────────────────

type Point = [number, number];

// Each point's twin on the other side of the body's middle.
function mirrored(points: Point[]): Point[] {
  return points.map(([x, y]): Point => [-x, y]);
}

// The point at the index, or the nearest end when the index runs past one.
function clamped<Item>(items: Item[], index: number): Item {
  return items[Math.min(Math.max(index, 0), items.length - 1)]!;
}

// A smooth curve through the points, each turn following its neighbours.
function smooth(points: Point[]): string {
  let path = `M${clamped(points, 0).join(" ")}`;
  for (let index = 1; index < points.length; index += 1) {
    const [before, start, end, after] = [clamped(points, index - 2), clamped(points, index - 1), clamped(points, index), clamped(points, index + 1)];
    const control_start = [start[0] + (end[0] - before[0]) / 6, start[1] + (end[1] - before[1]) / 6];
    const control_end = [end[0] - (after[0] - start[0]) / 6, end[1] - (after[1] - start[1]) / 6];
    path += ` C${[...control_start, ...control_end, ...end].map(round).join(" ")}`;
  }
  return path;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

// One edge of a limb, offset from its middle line by its half width at each point, on the outer or the inner side.
function limb_edge(middle: [number, number, number][], side: 1 | -1): Point[] {
  return middle.map(([x, y, half_width], index) => {
    const before = clamped(middle, index - 1);
    const after = clamped(middle, index + 1);
    const length = Math.hypot(after[0] - before[0], after[1] - before[1]);
    const normal: Point = [(after[1] - before[1]) / length, -(after[0] - before[0]) / length];
    return [x + side * normal[0] * half_width, y + side * normal[1] * half_width];
  });
}

// ── Outline ──────────────────────────────────────────────────────────────────

// The right arm's middle line from the shoulder to the fingertips, with its half width: upper arm, elbow, forearm, hand.
const arm_middle: [number, number, number][] = [
  [90, 180, 22],
  [101, 218, 20],
  [112, 256, 18],
  [121, 288, 16],
  [132, 320, 18],
  [146, 362, 15],
  [158, 398, 11],
  [166, 424, 15],
  [174, 452, 14],
];

const fingertips: Point[] = [[184, 470], [180, 482], [172, 480]];

const armpit: Point = [78, 190];

const arm_outer = limb_edge(arm_middle, 1);

// The inside of the arm stops where it meets the side at the armpit.
const arm_inner = limb_edge(arm_middle, -1).slice(1).reverse();

// The right half from under the jaw down the neck and over the shoulder.
const neck_and_shoulder: Point[] = [[15, 90], [17, 106], [24, 119], [40, 128], [62, 134], [84, 142], [99, 150], [108, 164], clamped(arm_outer, 0)];

// The right half from the armpit down the side and the outside of the leg, round the foot and up the inside to the crotch.
const side_and_leg: Point[] = [
  armpit, [75, 206], [73, 224], [71, 240], [66, 268], [62, 292], [65, 318], [72, 344], [78, 370], [79, 398], [76, 436],
  [70, 474], [62, 510], [60, 534], [62, 562], [62, 592], [57, 632], [48, 672], [42, 704], [42, 722], [47, 737],
  [42, 749], [24, 751], [16, 744], [17, 722], [19, 702], [17, 664], [14, 618], [16, 582], [13, 546], [11, 512],
  [10, 476], [8, 440], [5, 410], [0, 400],
];

// The runs of the right half, from under the jaw to the crotch, each meeting the next at a corner.
const shoulder_to_armpit: Point[] = [...arm_outer, ...fingertips, ...arm_inner, armpit];
const right_runs = [neck_and_shoulder, shoulder_to_armpit, side_and_leg];

// A run's curve without its starting move, to carry on from where the last one ended.
function continued(points: Point[]): string {
  return smooth(points).replace(/^M[^C]*/, " ");
}

// The body's outline without the head: the right half down to the crotch, then the left half back up to under the jaw.
export const body_outline = [
  smooth(neck_and_shoulder),
  continued(shoulder_to_armpit),
  continued(side_and_leg),
  ...[...right_runs].reverse().map((run) => continued(mirrored(run).reverse())),
].join("");

export const head_outline = `${smooth([
  [0, 0], [24, 5], [35, 24], [36, 50], [32, 72], [22, 90], [10, 99], [0, 101], [-10, 99], [-22, 90], [-32, 72], [-36, 50], [-35, 24], [-24, 5], [0, 0],
])}Z`;

// ── Landmarks ────────────────────────────────────────────────────────────────

// Both sides of a landmark drawn on the right half.
function both_sides(points: Point[]): string[] {
  return [smooth(points), smooth(mirrored(points))];
}

// The front's faint lines: collarbones, chest, lower ribs, hip creases and kneecaps, then the navel and nipples as dots.
export const front_lines: string[] = [
  ...both_sides([[6, 130], [30, 126], [62, 136]]),
  ...both_sides([[8, 204], [26, 216], [48, 216], [66, 202]]),
  ...both_sides([[3, 240], [30, 252], [58, 274]]),
  ...both_sides([[66, 338], [44, 366], [22, 388], [8, 400]]),
  "M27 518 A10 12 0 1 0 47 518 A10 12 0 1 0 27 518",
  "M-27 518 A10 12 0 1 1 -47 518 A10 12 0 1 1 -27 518",
];

export const front_dots: Point[] = [[0, 300], [42, 204], [-42, 204]];

// The back's faint lines: spine, shoulder blades with their ridges and the buttocks' fold.
export const back_lines: string[] = [
  smooth([[0, 122], [0, 240], [0, 350]]),
  ...both_sides([[26, 150], [28, 192], [44, 238], [62, 210], [76, 182]]),
  ...both_sides([[24, 172], [56, 158], [90, 150]]),
  smooth([[0, 350], [0, 398]]),
  ...both_sides([[4, 402], [36, 412], [72, 398]]),
];
