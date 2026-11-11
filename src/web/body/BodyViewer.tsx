// The 3D body on a canvas that turns with a drag and zooms with a wheel or pinch; it draws one or more bodies, each in its own colour and opacity, can shade the first by how it differs from another shape, and can share its view with another canvas.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import * as three from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { change_of_positions, parse_body_model, shape_positions, type BodyModel, type ShapeParameters } from "../../shared/body/shape.ts";
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

// ── Viewer ───────────────────────────────────────────────────────────────────

export interface Look {
  // A CSS colour such as "#2563eb".
  color: string;
  // From 0 to 1; below 1 the body is see-through.
  opacity: number;
}

// Canvases that share one link turn and zoom together.
export interface ViewLink {
  listeners: Set<(source: symbol, view: three.Spherical) => void>;
}

export function create_view_link(): ViewLink {
  return { listeners: new Set() };
}

interface BodyViewerProps {
  model: BodyModel;
  // The bodies to draw, a null one leaving its place empty; each takes the look at the same place.
  shapes: (ShapeParameters | null)[];
  looks: Look[];
  // Shades the first body red where it lies outside this shape and teal where it lies inside, in place of its colour.
  change_from?: ShapeParameters | null;
  link?: ViewLink;
  label: string;
}

interface Scene {
  renderer: three.WebGLRenderer;
  scene: three.Scene;
  camera: three.PerspectiveCamera;
  controls: OrbitControls;
  meshes: three.Mesh<three.BufferGeometry, three.MeshStandardMaterial>[];
  draw: () => void;
}

// Every canvas frames the same height, so bodies of different sizes sit true to each other.
const framed_middle = 9;
const framed_distance = 48;

// The skin moving this many cm or more takes the shade's full colour; a girth 9 cm smaller moves it about that far.
const full_change = 1.5;
const grown_color = new three.Color("#dc2626");
const shrunk_color = new three.Color("#0891b2");
// A shaded body starts grey, whatever its colour, so both shades stand out.
const unchanged_color = new three.Color("#d4d4d8");

// Each vertex grey, leaning to the grown or shrunk colour as far as it moved.
function change_colors(change: Float32Array): three.BufferAttribute {
  const colors = new Float32Array(change.length * 3);
  const mixed = new three.Color();
  change.forEach((amount, vertex) => {
    mixed.copy(unchanged_color).lerp(amount > 0 ? grown_color : shrunk_color, Math.min(1, Math.abs(amount) / full_change));
    mixed.toArray(colors, vertex * 3);
  });
  return new three.BufferAttribute(colors, 3);
}

function style_mesh(mesh: Scene["meshes"][number], look: Look, order: number): void {
  const material = mesh.material;
  const change = mesh.userData.change as Float32Array | null | undefined;
  if (change) mesh.geometry.setAttribute("color", change_colors(change));
  material.vertexColors = Boolean(change);
  material.color.set(change ? "#ffffff" : look.color);
  material.opacity = look.opacity;
  material.transparent = look.opacity < 1;
  material.depthWrite = look.opacity >= 1;
  material.needsUpdate = true;
  mesh.renderOrder = order;
}

export function BodyViewer({ model, shapes, looks, change_from, link, label }: BodyViewerProps) {
  const holder = useRef<HTMLDivElement>(null);
  const scene_ref = useRef<Scene | null>(null);
  const link_ref = useRef(link);
  const identity = useRef(Symbol("viewer"));
  const [failed, set_failed] = useState(false);
  link_ref.current = link;

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
    camera.position.set(0, framed_middle, framed_distance);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 10;
    controls.maxDistance = 120;
    controls.target.set(0, framed_middle, 0);
    controls.update();

    const draw = () => renderer.render(scene, camera);
    let following = false;
    controls.addEventListener("change", () => {
      draw();
      if (following) return;
      const view = new three.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      for (const listener of link_ref.current?.listeners ?? []) listener(identity.current, view);
    });
    const follow = (source: symbol, view: three.Spherical) => {
      if (source === identity.current) return;
      following = true;
      camera.position.setFromSpherical(view).add(controls.target);
      controls.update();
      following = false;
    };
    link_ref.current?.listeners.add(follow);

    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      draw();
    });
    resize.observe(element);
    const current: Scene = { renderer, scene, camera, controls, meshes: [], draw };
    scene_ref.current = current;
    const leaving_link = link_ref.current;

    return () => {
      leaving_link?.listeners.delete(follow);
      resize.disconnect();
      controls.dispose();
      for (const mesh of current.meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      renderer.dispose();
      renderer.domElement.remove();
      scene_ref.current = null;
    };
  }, []);

  // Each body is built again only when its shape changes.
  useEffect(() => {
    const current = scene_ref.current;
    if (!current) return;
    while (current.meshes.length > shapes.length) {
      const extra = current.meshes.pop()!;
      current.scene.remove(extra);
      extra.geometry.dispose();
      extra.material.dispose();
    }
    shapes.forEach((shape, index) => {
      let mesh = current.meshes[index];
      if (!mesh) {
        mesh = new three.Mesh(new three.BufferGeometry(), new three.MeshStandardMaterial({ roughness: 0.7 }));
        current.meshes.push(mesh);
        current.scene.add(mesh);
      }
      mesh.geometry.dispose();
      mesh.geometry = shape ? geometry_of(model, shape) : new three.BufferGeometry();
      // Stands the body on the floor.
      mesh.geometry.computeBoundingBox();
      mesh.position.y = shape ? -mesh.geometry.boundingBox!.min.y : 0;
      const positions = mesh.geometry.getAttribute("position");
      const shaded = index === 0 && shape && change_from;
      mesh.userData.change = shaded ? change_of_positions(positions.array as Float32Array, shape_positions(model, change_from), mesh.geometry.getAttribute("normal").array as Float32Array) : null;
    });
    current.draw();
  }, [model, shapes, change_from]);

  useEffect(() => {
    const current = scene_ref.current;
    if (!current) return;
    current.meshes.forEach((mesh, index) => style_mesh(mesh, looks[index] ?? looks[0]!, index));
    current.draw();
  }, [looks, shapes, change_from]);

  if (failed) return <p className="muted">This device cannot draw 3D (WebGL is off or missing), so the body cannot be shown.</p>;
  return <div ref={holder} className="body-viewer" role="img" aria-label={label} />;
}
