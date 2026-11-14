// Pictures of where to pinch each caliper skinfold: the body from the front and from behind, with a short line in the
// accent colour along each fold to take and a dot where the calipers go. One site shows only its own view, cropped
// close; several show both views, each site numbered as in the list under the picture.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { Popover } from "@x-tech-laboratories/x-libs/web/react/menus";

import { skinfolds, type Skinfold } from "../../shared/calculators/formulas.ts";
import { back_lines, body_outline, front_dots, front_lines, head_outline } from "./skinfold_figure.ts";
import "./skinfold.css";

// ── Sites ────────────────────────────────────────────────────────────────────

type View = "front" | "back";

interface Site {
  view: View;
  // How far out on the person's right side the site is from the body's middle, and how far down from the head's top.
  out: number;
  down: number;
  // The fold's lean from upright in degrees, its top leaning outward when positive.
  lean: number;
  // Where the site's number sits when every site is shown, out and down in the same way.
  number_at: [number, number];
  where: string;
}

// Every site is on the person's right side, as the Jackson-Pollock method measures.
const sites: Record<Skinfold, Site> = {
  chest: { view: "front", out: 57, down: 196, lean: 60, number_at: [34, 160], where: "A diagonal fold halfway between the front of the armpit and the nipple; a third of the way for women." },
  abdomen: { view: "front", out: 10, down: 300, lean: 0, number_at: [10, 352], where: "A vertical fold 2 cm to the right of the navel." },
  thigh: { view: "front", out: 42, down: 459, lean: 0, number_at: [14, 459], where: "A vertical fold on the front of the thigh, halfway between the hip crease and the top of the kneecap." },
  triceps: { view: "back", out: 104, down: 224, lean: -16, number_at: [146, 224], where: "A vertical fold on the back of the upper arm, halfway between the shoulder and the elbow." },
  suprailiac: { view: "front", out: 56, down: 330, lean: 45, number_at: [92, 316], where: "A diagonal fold just above the front of the hip bone, in line with the front of the armpit." },
  midaxillary: { view: "front", out: 66, down: 242, lean: 0, number_at: [36, 240], where: "A vertical fold on the side of the ribs, straight below the armpit at the height of the bottom of the breastbone." },
  subscapular: { view: "back", out: 46, down: 245, lean: -45, number_at: [22, 274], where: "A diagonal fold just below the bottom corner of the shoulder blade." },
};

// The site's number in the list of skinfolds, from 1.
export function skinfold_number(fold: Skinfold): number {
  return skinfolds.findIndex((each) => each.key === fold) + 1;
}

function label_of(fold: Skinfold): string {
  return skinfolds.find((each) => each.key === fold)?.label ?? fold;
}

// "Where to pinch the belly skinfold: a vertical fold 2 cm to the right of the navel."
function described(fold: Skinfold): string {
  const where = sites[fold].where;
  return `Where to pinch the ${label_of(fold).toLowerCase()} skinfold: ${where.charAt(0).toLowerCase()}${where.slice(1)}`;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

// The figure is 750 tall with its arms reaching 190 either side of its middle; each view of several takes this width.
const view_width = 400;
const half_view = view_width / 2;
// One site is shown in a window this size, centred between the body's middle and the site.
const crop = { width: 300, height: 320 };

const colours = {
  muted: { stroke: "var(--text-tertiary)" },
  label: { fill: "var(--text-secondary)" },
  accent: { stroke: "var(--accent)" },
  number: { fill: "var(--accent)" },
  number_text: { fill: "var(--surface-default)" },
  halo: { stroke: "var(--surface-default)" },
};

// The person's right is the viewer's left from the front and the viewer's right from behind.
function outward(view: View): number {
  return view === "front" ? -1 : 1;
}

function Figure({ view }: { view: View }) {
  const lines = view === "front" ? front_lines : back_lines;
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <g fill="currentColor" stroke="none" opacity={0.07}>
        <path d={body_outline} />
        <path d={head_outline} />
      </g>
      <path d={body_outline} stroke="currentColor" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      <path d={head_outline} stroke="currentColor" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      {lines.map((line) => (
        <path key={line} d={line} style={colours.muted} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {view === "front" && front_dots.map(([x, y]) => <circle key={`${x} ${y}`} cx={x} cy={y} r={2.6} fill="currentColor" fillOpacity={0.5} />)}
    </g>
  );
}

// The fold as a short line with a dot in its middle, drawn larger when the whole body is shown smaller.
function Mark({ fold, numbered, size }: { fold: Skinfold; numbered: boolean; size: number }) {
  const site = sites[fold];
  const side = outward(site.view);
  const x = site.out * side;
  const radians = (site.lean * Math.PI) / 180;
  const half_length = 16 * size;
  const along_x = Math.sin(radians) * side * half_length;
  const along_y = -Math.cos(radians) * half_length;
  const line = `M${x + along_x} ${site.down + along_y} L${x - along_x} ${site.down - along_y}`;
  const [number_x, number_y] = [site.number_at[0] * side, site.number_at[1]];
  return (
    <g strokeLinecap="round">
      <path d={line} style={colours.halo} strokeWidth={10 * size} />
      <path d={line} style={colours.accent} strokeWidth={5 * size} />
      <circle cx={x} cy={site.down} r={6 * size} style={{ ...colours.halo, ...colours.number }} strokeWidth={2.5 * size} />
      {numbered && (
        <g>
          <circle cx={number_x} cy={number_y} r={19} style={{ ...colours.halo, ...colours.number }} strokeWidth={3} />
          <text x={number_x} y={number_y} dy="0.35em" textAnchor="middle" fontSize={24} fontWeight={700} style={colours.number_text}>
            {skinfold_number(fold)}
          </text>
        </g>
      )}
    </g>
  );
}

interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Which side is the person's right, in the frame's lower corners, and the view's name over it when named.
function SideLabels({ view, frame, named }: { view: View; frame: Frame; named: boolean }) {
  const [viewer_left, viewer_right] = [frame.left + 10, frame.left + frame.width - 10];
  const bottom = frame.top + frame.height - 10;
  return (
    <g fontSize={named ? 24 : 16} style={colours.label}>
      {named && <text x={frame.left + frame.width / 2} y={frame.top + 28} textAnchor="middle" fontWeight={700}>{view === "front" ? "Front" : "Back"}</text>}
      <text x={viewer_left} y={bottom} textAnchor="start">{view === "front" ? "R" : "L"}</text>
      <text x={viewer_right} y={bottom} textAnchor="end">{view === "front" ? "L" : "R"}</text>
    </g>
  );
}

function view_box(frame: Frame): string {
  return `${frame.left} ${frame.top} ${frame.width} ${frame.height}`;
}

// ── Diagram ──────────────────────────────────────────────────────────────────

function OneSite({ fold }: { fold: Skinfold }) {
  const site = sites[fold];
  const centre_x = (site.out * outward(site.view)) / 2;
  const frame = {
    left: Math.min(Math.max(centre_x - crop.width / 2, -half_view), half_view - crop.width),
    top: Math.min(Math.max(site.down - crop.height / 2, -10), 760 - crop.height),
    ...crop,
  };
  return (
    <figure className="skinfold-diagram">
      <svg role="img" aria-label={described(fold)} viewBox={view_box(frame)} className="skinfold-one">
        <Figure view={site.view} />
        <Mark fold={fold} numbered={false} size={1} />
        <SideLabels view={site.view} frame={frame} named={false} />
      </svg>
      <figcaption>
        <p>{site.where}</p>
        <p className="muted small">
          {site.view === "front" ? "Seen from the front, so your right side is on the left." : "Seen from behind, so your right side is on the right."}
        </p>
      </figcaption>
    </figure>
  );
}

function ManySites({ folds }: { folds: Skinfold[] }) {
  const views = (["front", "back"] as const).filter((view) => folds.some((fold) => sites[fold].view === view));
  const frame_of = (index: number): Frame => ({ left: index * view_width - half_view, top: -46, width: view_width, height: 806 });
  const names = folds.map((fold) => `${skinfold_number(fold)} ${label_of(fold).toLowerCase()}`).join(", ");
  return (
    <figure className="skinfold-diagram">
      <svg role="img" aria-label={`Where to pinch each skinfold on your right side, numbered as in the list: ${names}`} viewBox={view_box({ ...frame_of(0), width: view_width * views.length })} className="skinfold-many">
        {views.map((view, index) => (
          <g key={view}>
            <g transform={`translate(${index * view_width} 0)`}>
              <Figure view={view} />
              {folds.filter((fold) => sites[fold].view === view).map((fold) => <Mark key={fold} fold={fold} numbered size={1.4} />)}
            </g>
            <SideLabels view={view} frame={frame_of(index)} named />
          </g>
        ))}
      </svg>
      <figcaption>
        <ol className="skinfold-legend">
          {folds.map((fold) => (
            <li key={fold} value={skinfold_number(fold)}>{label_of(fold)}</li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}

// One site shows its own view with how to pinch it; several show both views, numbered.
export function SkinfoldDiagram({ folds }: { folds: Skinfold[] }) {
  const [only] = folds;
  if (folds.length === 1 && only) return <OneSite fold={only} />;
  return <ManySites folds={folds} />;
}

// ── Where to pinch ───────────────────────────────────────────────────────────

// A small "Where" button beside a skinfold metric's name, opening the picture of its site in a popover.
export function SkinfoldWhere({ fold, name }: { fold: Skinfold; name: string }) {
  const [open, set_open] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // A press on the button closes an open popover before the click lands, so the click goes by how it was at the press.
  const open_at_press = useRef<boolean | null>(null);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="link small"
        aria-label={`Where to pinch for ${name}`}
        aria-expanded={open}
        onPointerDown={() => { open_at_press.current = open; }}
        onClick={() => {
          const was_open = open_at_press.current ?? open;
          open_at_press.current = null;
          set_open(!was_open);
        }}
      >
        Where
      </button>
      {open && (
        <Popover anchor={button.current} label={`Where to pinch for ${name}`} on_close={() => set_open(false)}>
          <div className="skinfold-where">
            <SkinfoldDiagram folds={[fold]} />
          </div>
        </Popover>
      )}
    </>
  );
}
