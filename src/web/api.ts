// The page's one way to the data, whichever host it runs on, a watch every view reloads on when anything changed, here
// or on another page or device, and calls run with their failure shown as a toast.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { Client } from "@x-tech-laboratories/x-libs/electron/bridge";
import { describe_error } from "@x-tech-laboratories/x-libs/web/errors";
import { create_watch } from "@x-tech-laboratories/x-libs/web/watch";
import { use_resource, type Resource } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { is_read_only, type PageApi } from "../shared/page_api.ts";
import type { FitnessMethods } from "../shared/store.ts";

// ── Api ──────────────────────────────────────────────────────────────────────

// Bumped after each write this page makes and each change from elsewhere.
export const data_watch = create_watch();

let page_api: PageApi | null = null;

// A write tells this page's views too, since the host only tells the other pages.
// Calls are looked up by name as they are made, since a browser's calls are a proxy with no list of names.
export function set_page_api(api: PageApi): void {
  const host_calls = api.calls as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const calls = new Proxy({} as Client<FitnessMethods>, {
    get: (_target, name) => {
      if (typeof name !== "string") return undefined;
      return async (...args: unknown[]) => {
        const result = await host_calls[name]!(...args);
        if (!is_read_only(name)) data_watch.bump();
        return result;
      };
    },
  });
  page_api = { ...api, calls };
  api.on_change(() => data_watch.bump());
}

export function page(): PageApi {
  if (!page_api) throw new Error("the page's api has not been set up");
  return page_api;
}

// Every data call, such as calls().get_settings().
export function calls(): Client<FitnessMethods> {
  return page().calls;
}

// Saves one setting, such as set_setting("mass_unit", "lb").
export async function set_setting(key: string, value: unknown): Promise<void> {
  await calls().set_setting(key, value);
}

// ── Failures ─────────────────────────────────────────────────────────────────

// Shows anything thrown as a toast.
export function show_error(error: unknown): void {
  toast(describe_error(error), { tone: "bad" });
}

// Runs a call and shows its failure as a toast, giving undefined back then.
export async function attempt<Result>(work: () => Promise<Result>, done?: string): Promise<Result | undefined> {
  try {
    const result = await work();
    if (done) toast(done, { tone: "good" });
    return result;
  } catch (error) {
    show_error(error);
    return undefined;
  }
}

// Whether a call that answers nothing went through, its failure shown as a toast.
export async function succeeds(work: () => Promise<unknown>, done?: string): Promise<boolean> {
  try {
    await work();
    if (done) toast(done, { tone: "good" });
    return true;
  } catch (error) {
    show_error(error);
    return false;
  }
}

// ── Hooks ────────────────────────────────────────────────────────────────────

// Loads with the page's calls and loads again quietly whenever the data changed.
export function use_data<Data>(load: (api: Client<FitnessMethods>) => Promise<Data>, dependencies: unknown[] = []): Resource<Data> {
  return use_resource(() => load(calls()), dependencies, { watch: data_watch });
}

// Every setting, with the defaults filled in by the host.
export function use_settings(): Resource<Record<string, unknown>> {
  return use_data((api) => api.get_settings());
}
