// Links such as x-fitness://workouts/log, which open the desktop app on that page from a notification or any other
// program.

// ── Links ────────────────────────────────────────────────────────────────────

export const link_scheme = "x-fitness";

const link_pattern = /^x-fitness:\/\/([a-z0-9/_-]*)$/i;

// The link to a page, given its route such as "#/workouts/log".
export function app_link(route: string): string {
  return `${link_scheme}://${route.replace(/^#?\/?/, "")}`;
}

// The page's route a link names, such as "#/workouts/log", or null when the text is not one of the app's links.
export function route_of_link(text: string): string | null {
  const path = link_pattern.exec(text)?.[1];
  return path === undefined ? null : `#/${path.replace(/\/+$/, "")}`;
}
