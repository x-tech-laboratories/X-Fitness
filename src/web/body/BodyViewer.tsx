// The 3D body on a canvas that turns with a drag and zooms with a wheel or pinch, with the goal body as an outline.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import * as three from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { parse_body_model, shape_positions, type BodyModel, type ShapeParameters } from "../../shared/body/shape.ts";
import model_url from "./body_model.bin?url";

// ── Model ────────────────────────────────────────────────────────────────────

let model_promise: Promise<BodyModel> | null = null;

// The model is a few megabytes, so it loads once, when a body is first drawn.
export function load_body_model(): Promise<BodyModel> {
  model_promise ??= fetch(model_url)
    .then((response) => response.arrayBuffer())
    .then(parse_body_model);
  return model_promise;
}

// Each quad as two triangles; a triangle repeats its last corner, so its second half is left out.
function triangles_of(model: BodyModel): number[] {
  const indices: number[] = [];
  for (let face = 0; face < model.faces.length; face += 4) {
    const [first, second, third, fourth] = [model.faces[face]!, model.faces[face + 1]!, model.faces[face + 2]!, model.faces[face + 3]!];
    indices.push(first, second, third);
    if (fourth !== third) indices.push(first, third, fourth);
  }
  return indices;
}

function geometry_of(model: BodyModel, parameters: ShapeParameters): three.BufferGeometry {
  const geometry = new three.BufferGeometry();
  geometry.setAttribute("position", new three.BufferAttribute(shape_positions(model, parameters), 3));
  geometry.setIndex(triangles_of(model));
  geometry.computeVertexNormals();
  return geometry;
}

// A colour from Halon's tokens, so the body follows the theme.
function token_colour(element: Element, name: string, fallback: string): three.Color {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  try {
    return new three.Color(value || fallback);
  } catch {
    return new three.Color(fallback);
  }
}

// ── Viewer ───────────────────────────────────────────────────────────────────

interface BodyViewerProps {
  model: BodyModel;
  body: ShapeParameters | null;
  // Drawn as an outline round the body.
  goal: ShapeParameters | null;
  label: string;
}

interface Scene {
  renderer: three.WebGLRenderer;
  scene: three.Scene;
  camera: three.PerspectiveCamera;
  controls: OrbitControls;
  body: three.Mesh<three.BufferGeometry, three.MeshStandardMaterial>;
  goal: three.LineSegments<three.WireframeGeometry, three.LineBasicMaterial>;
  draw: () => void;
}

export function BodyViewer({ model, body, goal, label }: BodyViewerProps) {
  const holder = useRef<HTMLDivElement>(null);
  const scene_ref = useRef<Scene | null>(null);
  const [failed, set_failed] = useState(false);

  useEffect(() => {
    const element = holder.current!;
    let renderer: three.WebGLRenderer;
    try {
      renderer = new three.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      set_failed(true);
      return;
    }
    renderer.setPixelRatio(window.devicePixelRatio);
    element.append(renderer.domElement);

    const scene = new three.Scene();
    scene.add(new three.HemisphereLight(0xffffff, 0x666666, 2));
    const key_light = new three.DirectionalLight(0xffffff, 1.6);
    key_light.position.set(10, 20, 15);
    scene.add(key_light);

    const camera = new three.PerspectiveCamera(30, 1, 0.1, 500);
    camera.position.set(0, 1, 45);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 10;
    controls.maxDistance = 120;

    const body_mesh = new three.Mesh(new three.BufferGeometry(), new three.MeshStandardMaterial({ color: token_colour(element, "--series-1", "#4a7fd0"), roughness: 0.7 }));
    const goal_lines = new three.LineSegments(new three.WireframeGeometry(), new three.LineBasicMaterial({ color: token_colour(element, "--series-2", "#d08a4a"), transparent: true, opacity: 0.25 }));
    scene.add(body_mesh, goal_lines);

    const draw = () => renderer.render(scene, camera);
    controls.addEventListener("change", draw);
    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      draw();
    });
    resize.observe(element);
    scene_ref.current = { renderer, scene, camera, controls, body: body_mesh, goal: goal_lines, draw };

    return () => {
      resize.disconnect();
      controls.dispose();
      body_mesh.geometry.dispose();
      goal_lines.geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene_ref.current = null;
    };
  }, []);

  useEffect(() => {
    const current = scene_ref.current;
    if (!current) return;
    current.body.geometry.dispose();
    current.body.geometry = body ? geometry_of(model, body) : new three.BufferGeometry();
    current.goal.geometry.dispose();
    const goal_geometry = goal ? geometry_of(model, goal) : null;
    current.goal.geometry = goal_geometry ? new three.WireframeGeometry(goal_geometry) : new three.WireframeGeometry();

    // Stands the body on the floor in the middle, and the camera on its middle.
    const placed = body ? current.body.geometry : goal_geometry;
    placed?.computeBoundingBox();
    const bounds = placed?.boundingBox ?? new three.Box3(new three.Vector3(), new three.Vector3(0, 17, 0));
    goal_geometry?.dispose();
    const centre = bounds.getCenter(new three.Vector3());
    for (const object of [current.body, current.goal]) object.position.set(-centre.x, -bounds.min.y, -centre.z);
    current.controls.target.set(0, (bounds.max.y - bounds.min.y) / 2, 0);
    current.controls.update();
    current.draw();
  }, [model, body, goal]);

  if (failed) return <p className="muted">This device cannot draw 3D (WebGL is off or missing), so the body cannot be shown.</p>;
  return <div ref={holder} className="body-viewer" role="img" aria-label={label} />;
}
