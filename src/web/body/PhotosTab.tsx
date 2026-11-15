// The Photos page: progress photos by day, each with its pose and a note, added from a file or the phone's camera, and
// two days compared side by side pose by pose.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { today } from "@x-tech-laboratories/x-libs/dates";
import { describe_error } from "@x-tech-laboratories/x-libs/web/errors";
import { shrink_picture } from "@x-tech-laboratories/x-libs/web/pictures";
import { Segmented, Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { Dialog, open_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { FormRow, Toolbar } from "@x-tech-laboratories/x-libs/web/react/layout";
import { MediaGrid, MediaTile } from "@x-tech-laboratories/x-libs/web/react/media";
import { MenuButton } from "@x-tech-laboratories/x-libs/web/react/menu_button";
import { use_pref } from "@x-tech-laboratories/x-libs/web/react/prefs";
import { Empty, Loaded } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { photo_poses, pose_label, type PhotoPose, type PhotoSummary } from "../../shared/body/photos.ts";
import { calls, succeeds, use_data } from "../api.ts";
import { HistoryButton, open_item_history } from "../history/HistoryView.tsx";
import { confirm_delete } from "../rows.tsx";

// ── Pictures ─────────────────────────────────────────────────────────────────

// A photo kept sharp enough to see detail on a large screen, and its small copy for the gallery.
const full_side = 2000;
const thumbnail_side = 400;

interface Taken {
  picture: string;
  thumbnail: string;
}

async function take_picture(file: File): Promise<Taken> {
  const [picture, thumbnail] = await Promise.all([
    shrink_picture(file, { largest_side: full_side, quality: 0.85 }),
    shrink_picture(file, { largest_side: thumbnail_side, quality: 0.8 }),
  ]);
  return { picture, thumbnail };
}

const photo_link = (id: string) => `#/body/photos/${encodeURIComponent(id)}`;

const photo_name = (photo: { date: string; pose: PhotoPose }) => `${pose_label(photo.pose)} photo on ${photo.date}`;

// The first of front, side and back not yet taken on the day, so a series of photos fills the poses in turn.
function next_pose(photos: PhotoSummary[], date: string): PhotoPose {
  const taken = new Set(photos.filter((photo) => photo.date === date).map((photo) => photo.pose));
  return photo_poses.find((pose) => pose.key !== "" && !taken.has(pose.key))?.key ?? "";
}

// ── Dialog ───────────────────────────────────────────────────────────────────

interface Draft {
  date: string;
  pose: PhotoPose;
  comment: string;
}

interface PhotoDialogProps {
  // The photo being changed, or null for a new one.
  id: string | null;
  // A new photo's pictures and where it starts.
  taken?: Taken;
  start?: Draft;
  on_close: () => void;
}

function PhotoDialog({ id, taken, start, on_close }: PhotoDialogProps) {
  const stored = use_data((api) => (id ? api.get_body_photo(id) : Promise.resolve(null)), [id]);
  // The fields as changed here, or null while they are still the stored photo's.
  const [draft, set_draft] = useState<Draft | null>(start ?? null);
  const photo = stored.data;
  const shown = draft ?? (photo ? { date: photo.date, pose: photo.pose, comment: photo.comment } : null);
  const change = (changes: Partial<Draft>) => shown && set_draft({ ...shown, ...changes });
  const picture = taken?.picture ?? photo?.picture;

  async function save(): Promise<void> {
    if (!shown) return;
    if (await succeeds(() => calls().save_body_photo({ id: id ?? undefined, ...shown, ...taken }))) on_close();
  }

  function remove(): void {
    if (!id || !photo) return;
    confirm_delete(`Delete the ${photo_name(photo).toLowerCase()}?`, "Its history keeps it, so it can be brought back.", async () => {
      if (await succeeds(() => calls().delete_body_photo(id))) on_close();
    });
  }

  return (
    <Dialog
      title={id ? "Progress photo" : "Add photo"}
      subtitle={photo ? photo_name(photo) : undefined}
      wide
      actions={id && photo && <HistoryButton kind="body_photo" item_id={id} name={photo_name(photo)} />}
      buttons={
        id && photo && (
          <button type="button" className="danger" onClick={remove}>
            Delete
          </button>
        )
      }
      on_close={on_close}
      form={{ on_submit: (event) => { event.preventDefault(); void save(); }, submit_label: "Save", submit_disabled: !shown?.date }}
    >
      {picture ? <img className="body-photo-whole" src={picture} alt={shown ? photo_name(shown) : "The photo"} /> : <p className="muted">Loading…</p>}
      {shown && (
        <>
          <FormRow label="Day" id="body-photo-day">
            <input id="body-photo-day" type="date" required value={shown.date} onChange={(event) => event.currentTarget.value && change({ date: event.currentTarget.value })} />
          </FormRow>
          <FormRow label="Pose" id="body-photo-pose">
            <Select label="Pose" bare options={photo_poses.map((pose): [PhotoPose, string] => [pose.key, pose.label])} value={shown.pose} on_change={(pose) => change({ pose })} />
          </FormRow>
          <FormRow label="Note" id="body-photo-note">
            <textarea id="body-photo-note" rows={2} value={shown.comment} onChange={(event) => change({ comment: event.currentTarget.value })} />
          </FormRow>
        </>
      )}
    </Dialog>
  );
}

function open_photo(id: string): void {
  open_dialog((close) => <PhotoDialog id={id} on_close={close} />);
}

function remove_photo(photo: PhotoSummary): void {
  confirm_delete(`Delete the ${photo_name(photo).toLowerCase()}?`, "Its history keeps it, so it can be brought back.", () => succeeds(() => calls().delete_body_photo(photo.id)));
}

// ── Gallery ──────────────────────────────────────────────────────────────────

// The photos newest day first, each day's under its date.
function Gallery({ photos }: { photos: PhotoSummary[] }) {
  const days = [...new Set(photos.map((photo) => photo.date))];
  return (
    <div className="stack body-photos">
      {days.map((date) => (
        <section key={date} className="stack" aria-label={date}>
          <h3>{date}</h3>
          <MediaGrid label={`Photos on ${date}`}>
            {photos
              .filter((photo) => photo.date === date)
              .map((photo) => (
                <MediaTile
                  key={photo.id}
                  title={pose_label(photo.pose)}
                  href={photo_link(photo.id)}
                  image={photo.thumbnail}
                  on_open={() => open_photo(photo.id)}
                  lines={[photo.comment && <span className="muted">{photo.comment}</span>]}
                  actions={
                    <MenuButton
                      label={`Actions for the ${photo_name(photo).toLowerCase()}`}
                      items={[
                        { label: "Open", run: () => open_photo(photo.id) },
                        { label: "History", run: () => open_item_history("body_photo", photo.id, photo_name(photo)) },
                        { label: "Delete", run: () => remove_photo(photo), danger: true, separator_before: true },
                      ]}
                    />
                  }
                />
              ))}
          </MediaGrid>
        </section>
      ))}
    </div>
  );
}

// ── Compare ──────────────────────────────────────────────────────────────────

// One day's photo in a pose at its whole size, or a line saying there is none.
function ComparedPhoto({ photo, date }: { photo: PhotoSummary | undefined; date: string }) {
  const whole = use_data((api) => (photo ? api.get_body_photo(photo.id) : Promise.resolve(null)), [photo?.id]);
  return (
    <figure className="body-photo-compared">
      {photo ? (
        <img className="body-photo-whole" src={whole.data?.picture ?? photo.thumbnail} alt={photo_name(photo)} />
      ) : (
        <p className="muted">No photo in this pose.</p>
      )}
      <figcaption className="muted small">{photo?.comment ? `${date}: ${photo.comment}` : date}</figcaption>
    </figure>
  );
}

// Two days side by side, pose by pose, the first and the latest day to begin with.
function Compare({ photos }: { photos: PhotoSummary[] }) {
  const days = [...new Set(photos.map((photo) => photo.date))].sort();
  const [picked, set_picked] = useState<[string, string] | null>(null);
  const before = picked && days.includes(picked[0]) ? picked[0] : days[0]!;
  const after = picked && days.includes(picked[1]) ? picked[1] : days.at(-1)!;
  const options = days.map((date): [string, string] => [date, date]);
  const of_day = (date: string) => photos.filter((photo) => photo.date === date);
  const poses = photo_poses.filter((pose) => [...of_day(before), ...of_day(after)].some((photo) => photo.pose === pose.key));

  if (days.length < 2) return <Empty title="One day of photos." hint="Add photos on another day to compare the two." />;

  return (
    <div className="stack">
      <Toolbar>
        <Select label="Before" options={options} value={before} on_change={(date) => set_picked([date, after])} />
        <Select label="After" options={options} value={after} on_change={(date) => set_picked([before, date])} />
      </Toolbar>
      {poses.map((pose) => (
        <section key={pose.key} className="stack" aria-label={pose.label}>
          <h3>{pose.label}</h3>
          <div className="body-photos-compare">
            <ComparedPhoto date={before} photo={of_day(before).find((photo) => photo.pose === pose.key)} />
            <ComparedPhoto date={after} photo={of_day(after).find((photo) => photo.pose === pose.key)} />
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

type Layout = "gallery" | "compare";

const layouts: { value: Layout; label: string }[] = [
  { value: "gallery", label: "Gallery" },
  { value: "compare", label: "Compare" },
];

function is_layout(value: unknown): value is Layout {
  return layouts.some((layout) => layout.value === value);
}

// A photo's id after the tab in the route, such as from a tile opened in a new tab, opens it.
export function PhotosTab({ open_id }: { open_id?: string }) {
  const photos = use_data((api) => api.list_body_photos());
  const [layout, set_layout] = use_pref<Layout>("x-fitness-body-photo-layout", "gallery", is_layout);
  const [busy, set_busy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open_id) open_photo(open_id);
  }, [open_id]);

  async function add(file: File | undefined): Promise<void> {
    if (picker.current) picker.current.value = "";
    if (!file) return;
    set_busy(true);
    try {
      const taken = await take_picture(file);
      const date = today();
      const start = { date, pose: next_pose(photos.data ?? [], date), comment: "" };
      open_dialog((close) => <PhotoDialog id={null} taken={taken} start={start} on_close={close} />);
    } catch (failure) {
      toast(`Could not use that picture: ${describe_error(failure)}`, { tone: "bad" });
    } finally {
      set_busy(false);
    }
  }

  return (
    <div className="stack">
      <Toolbar>
        <Segmented label="Show" choices={layouts} value={layout} on_change={set_layout} />
        <input ref={picker} type="file" accept="image/*" hidden aria-label="Photo file" onChange={(event) => void add(event.currentTarget.files?.[0])} />
        <button type="button" className="accent solid" disabled={busy} onClick={() => picker.current?.click()}>
          {busy ? "Reading the photo…" : "Add photo"}
        </button>
      </Toolbar>
      <Loaded resource={photos}>
        {(loaded) =>
          loaded.length === 0 ? (
            <Empty title="No progress photos." hint="Add one with the Add photo button; on a phone it can come straight from the camera." />
          ) : layout === "compare" ? (
            <Compare photos={loaded} />
          ) : (
            <Gallery photos={loaded} />
          )
        }
      </Loaded>
    </div>
  );
}
