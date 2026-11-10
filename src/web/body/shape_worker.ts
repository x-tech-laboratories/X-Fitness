// Fits the 3D body to readings away from the page, so the page never stalls while the shape is worked out.

// ── Imports ──────────────────────────────────────────────────────────────────

import { fit_shape, parse_body_model, type BodyFit, type BodyMeasures } from "../../shared/body/shape.ts";
import model_url from "./body_model.bin?url";

// ── Fitting ──────────────────────────────────────────────────────────────────

export interface FitRequest {
  id: number;
  measures: BodyMeasures;
}

export interface FitAnswer {
  id: number;
  fit: BodyFit | null;
  error: string;
}

const model = fetch(model_url)
  .then((response) => response.arrayBuffer())
  .then(parse_body_model);

self.onmessage = async (event: MessageEvent<FitRequest>) => {
  const { id, measures } = event.data;
  try {
    self.postMessage({ id, fit: fit_shape(await model, measures), error: "" } satisfies FitAnswer);
  } catch (error) {
    self.postMessage({ id, fit: null, error: error instanceof Error ? error.message : String(error) } satisfies FitAnswer);
  }
};
