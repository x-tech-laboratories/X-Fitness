// What an AI client reads first about X-Fitness, and what MCP leaves out, wherever the MCP endpoint runs: the server or
// the desktop app.

export const mcp_instructions = [
  "X-Fitness holds one person's workouts, diet and body measurements.",
  "Days are local dates such as 2026-11-10; weights are in kg, lengths in cm, distances in km, durations in seconds and energy in kcal, whatever units Settings shows.",
  "Ids come from the list_ and get_ calls; get_workout_library, get_diet and list_body_metrics are the places to start.",
].join(" ");

// Settings that hold another service's key, which stay in the page's own settings.
const secret_settings = ["diet.usda_api_key"];

export function without_secrets(method: string, result: unknown): unknown {
  if (method !== "get_settings") return result;
  return Object.fromEntries(Object.entries(result as Record<string, unknown>).filter(([key]) => !secret_settings.includes(key)));
}
