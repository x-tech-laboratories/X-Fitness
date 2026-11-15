// Progress photos: the poses a photo can be in, its shapes, and the checks a photo passes before it is stored.

// ── Poses ────────────────────────────────────────────────────────────────────

export const photo_poses = [
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "back", label: "Back" },
  { key: "", label: "Other" },
] as const;

export type PhotoPose = (typeof photo_poses)[number]["key"];

export function photo_pose_of(value: unknown): PhotoPose {
  return photo_poses.find((pose) => pose.key === value)?.key ?? "";
}

export function pose_label(pose: PhotoPose): string {
  return photo_poses.find((each) => each.key === pose)!.label;
}

// ── Shapes ───────────────────────────────────────────────────────────────────

// A photo as the gallery lists it, with only its small picture.
export interface PhotoSummary {
  id: string;
  date: string;
  pose: PhotoPose;
  comment: string;
  // A small picture as a data URL, or the whole picture when none was given.
  thumbnail: string;
}

export interface BodyPhoto extends PhotoSummary {
  // The whole picture as a data URL.
  picture: string;
}

// A picture or thumbnail left out keeps the one stored; a new photo needs a picture.
export interface PhotoInput {
  id?: string;
  date: string;
  pose?: string;
  comment?: string;
  picture?: string;
  thumbnail?: string;
}

// ── Checks ───────────────────────────────────────────────────────────────────

// A phone photo shrunk to 2000 pixels comes well under this as WebP.
export const photo_limit = 4_000_000;

export const thumbnail_limit = 200_000;

// A picture is a data URL of an image under the limit, or left out to keep the one stored.
export function check_picture(picture: string | undefined, limit: number, what: string): string | undefined {
  if (picture === undefined) return undefined;
  if (!/^data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+$/.test(picture)) throw new Error(`The ${what} must be a data URL of an image, such as data:image/webp;base64,….`);
  if (picture.length > limit) throw new Error(`The ${what} is too large; shrink it under ${limit / 1_000_000} MB.`);
  return picture;
}
