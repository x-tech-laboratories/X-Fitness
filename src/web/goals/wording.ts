// The words the Goals page shares between its sections.

// ── Labels ───────────────────────────────────────────────────────────────────

// The measures the page reads by metric role, as a person names them.
export const role_labels = { weight: "Weight", height: "Height", body_fat: "Body fat", waist: "Waist" } as const;

// ── Distance ─────────────────────────────────────────────────────────────────

// How far a goal is from now in words, such as "7.4 kg to lose", given the gap and how to write an amount of it.
export function distance_words(difference: number, amount: (gap: number) => string, is_weight: boolean): string {
  if (Math.abs(difference) < 0.05) return "Reached";
  const verb = is_weight ? (difference < 0 ? "to lose" : "to gain") : difference < 0 ? "to go down" : "to go up";
  return `${amount(Math.abs(difference))} ${verb}`;
}
