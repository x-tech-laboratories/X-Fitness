// Packs MakeHuman's CC0 body mesh and the targets the 3D body uses into src/web/body/body_model.bin.
// Run with the makehuman/data folder of a MakeHuman 1.x checkout: node scripts/build_body_model.ts <makehuman/data>

// ── Imports ──────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { girth_names, height_targets, sexes, universal_targets } from "../src/shared/body/shape.ts";

// ── Reading ──────────────────────────────────────────────────────────────────

const data_folder = process.argv[2];
if (!data_folder) throw new Error("Give the makehuman/data folder.");

interface Mesh {
  positions: number[];
  faces: number[];
}

// The vertices and faces of the "body" group; its vertices come first in the file, so the body keeps their numbers.
function read_body_mesh(): Mesh {
  const positions: number[] = [];
  const faces: number[] = [];
  let group = "";
  for (const line of readFileSync(join(data_folder, "3dobjs/base.obj"), "utf8").split("\n")) {
    const words = line.trim().split(/\s+/);
    if (words[0] === "v") positions.push(Number(words[1]), Number(words[2]), Number(words[3]));
    else if (words[0] === "g") group = words[1] ?? "";
    else if (words[0] === "f" && group === "body") {
      const corners = words.slice(1).map((word) => Number(word.split("/")[0]) - 1);
      faces.push(corners[0]!, corners[1]!, corners[2]!, corners[3] ?? corners[2]!);
    }
  }
  const vertex_count = Math.max(...faces) + 1;
  return { positions: positions.slice(0, vertex_count * 3), faces };
}

type Target = Map<number, [number, number, number]>;

function read_target(path: string, vertex_count: number): Target {
  const target: Target = new Map();
  for (const line of readFileSync(join(data_folder, "targets", path), "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [index, x, y, z] = line.trim().split(/\s+/).map(Number);
    if (index! < vertex_count) target.set(index!, [x!, y!, z!]);
  }
  return target;
}

// The three ethnic targets weighted a third each, as MakeHuman's default human mixes them.
function mixed_target(paths: string[], vertex_count: number): Target {
  const mixed: Target = new Map();
  for (const path of paths) {
    for (const [index, [x, y, z]] of read_target(path, vertex_count)) {
      const sum = mixed.get(index) ?? [0, 0, 0];
      mixed.set(index, [sum[0] + x / paths.length, sum[1] + y / paths.length, sum[2] + z / paths.length]);
    }
  }
  return mixed;
}

// ── Writing ──────────────────────────────────────────────────────────────────

class Writer {
  private bytes = new Uint8Array(1 << 20);
  private view = new DataView(this.bytes.buffer);
  length = 0;

  private room(size: number): void {
    if (this.length + size <= this.bytes.length) return;
    const bigger = new Uint8Array(Math.max(this.bytes.length * 2, this.length + size));
    bigger.set(this.bytes);
    this.bytes = bigger;
    this.view = new DataView(bigger.buffer);
  }

  u8(value: number): void { this.room(1); this.view.setUint8(this.length, value); this.length += 1; }
  u16(value: number): void { this.room(2); this.view.setUint16(this.length, value, true); this.length += 2; }
  i16(value: number): void { this.room(2); this.view.setInt16(this.length, value, true); this.length += 2; }
  u32(value: number): void { this.room(4); this.view.setUint32(this.length, value, true); this.length += 4; }
  f32(value: number): void { this.room(4); this.view.setFloat32(this.length, value, true); this.length += 4; }

  text(value: string): void {
    const encoded = new TextEncoder().encode(value);
    this.u8(encoded.length);
    for (const byte of encoded) this.u8(byte);
  }

  result(): Uint8Array { return this.bytes.slice(0, this.length); }
}

// Each target as its moved vertices and their moves in 16-bit steps of one scale.
function write_target(writer: Writer, name: string, target: Target): void {
  const entries = [...target].filter(([, move]) => move.some((part) => part !== 0)).sort((first, second) => first[0] - second[0]);
  const largest = Math.max(1e-9, ...entries.flatMap(([, move]) => move.map(Math.abs)));
  const scale = largest / 32767;
  writer.text(name);
  writer.f32(scale);
  writer.u32(entries.length);
  for (const [index] of entries) writer.u16(index);
  for (const [, move] of entries) for (const part of move) writer.i16(Math.round(part / scale));
}

const mesh = read_body_mesh();
const vertex_count = mesh.positions.length / 3;
const writer = new Writer();
for (const letter of "XFBM") writer.u8(letter.charCodeAt(0));
writer.u32(1);
writer.u32(vertex_count);
writer.u32(mesh.faces.length / 4);
for (const value of mesh.positions) writer.f32(value);
for (const index of mesh.faces) writer.u16(index);

const targets: [string, Target][] = [];
for (const sex of sexes) {
  targets.push([`${sex}-young`, mixed_target(["african", "asian", "caucasian"].map((race) => `macrodetails/${race}-${sex}-young.target`), vertex_count)]);
}
for (const name of universal_targets()) targets.push([name, read_target(`macrodetails/${name}.target`, vertex_count)]);
for (const name of height_targets()) targets.push([name, read_target(`macrodetails/height/${name}.target`, vertex_count)]);
for (const girth of girth_names) {
  for (const way of ["decr", "incr"]) targets.push([`measure-${girth}-circ-${way}`, read_target(`measure/measure-${girth}-circ-${way}.target`, vertex_count)]);
}
writer.u32(targets.length);
for (const [name, target] of targets) write_target(writer, name, target);

const output = new URL("../src/web/body/body_model.bin", import.meta.url);
writeFileSync(output, writer.result());
console.log(`${vertex_count} vertices, ${mesh.faces.length / 4} faces, ${targets.length} targets, ${writer.length} bytes`);
