// The argument shapes many calls share, as JSON Schema, for the specs other programs read through MCP and OpenAPI.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { JsonSchema } from "@x-tech-laboratories/x-libs/api_spec";

// ── Shapes ───────────────────────────────────────────────────────────────────

export function text(description: string): JsonSchema {
  return { type: "string", description };
}

export function number(description: string): JsonSchema {
  return { type: "number", description };
}

export function id_of(thing: string): JsonSchema {
  return { type: "string", description: `The ${thing}'s id, as a list or get call gives it.` };
}

export const day: JsonSchema = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "A local day, such as 2026-11-10." };

export const moment: JsonSchema = { type: "string", description: "A moment as an ISO 8601 timestamp, such as 2026-11-10T18:30:00.000Z." };

export const categories: JsonSchema = {
  type: "array",
  items: { type: "string" },
  description: 'Category paths, a slash nesting one inside another, such as "Protein/Meat".',
};

export const json_file: JsonSchema = { type: "string", description: "The whole file's text." };

// One step through a list: -1 moves it up, 1 down.
export const step: JsonSchema = { type: "integer", enum: [-1, 1], description: "-1 moves it one place earlier, 1 one place later." };
