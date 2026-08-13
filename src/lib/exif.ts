/**
 * Reading capture time and location out of a JPEG before it is re-encoded.
 *
 * Compressing a photo in a canvas discards every EXIF tag it carried. For most
 * uploads that is a fair trade, but the evidence upload tells the farmer that a
 * photo taken on site is the strongest proof precisely because it carries its
 * date and often its coordinates — so silently destroying those while claiming
 * they are what makes the photo credible would be dishonest.
 *
 * This reads the two fields that matter as evidence, so they can be stored as
 * columns before the pixels are re-encoded. It is deliberately small: it walks
 * to the APP1 segment, reads the TIFF header, and looks up three tags. Anything
 * it does not understand it declines on, returning nulls rather than guesses —
 * a wrong coordinate on a piece of evidence is worse than no coordinate.
 */

export interface PhotoMetadata {
  /** EXIF DateTimeOriginal as an ISO string, or null if absent. */
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
}

export const NO_METADATA: PhotoMetadata = {
  capturedAt: null,
  latitude: null,
  longitude: null,
};

/**
 * Validates metadata arriving from the browser before it reaches a row.
 *
 * The client is the only thing that can read EXIF, since the original file
 * never leaves it — but that also means these values are whatever a caller
 * chose to send, so they are checked rather than trusted. Anything out of range
 * or unparseable becomes null instead of rejecting the upload, because the file
 * itself is still valid evidence with or without its metadata.
 */
export function sanitisePhotoMetadata(input: unknown): PhotoMetadata {
  if (typeof input !== "object" || input === null) return NO_METADATA;
  const raw = input as Partial<Record<keyof PhotoMetadata, unknown>>;

  let capturedAt: string | null = null;
  if (typeof raw.capturedAt === "string") {
    const parsed = new Date(raw.capturedAt);
    const time = parsed.getTime();
    if (
      !Number.isNaN(time) &&
      parsed.getUTCFullYear() >= 2000 &&
      time <= Date.now() + 86_400_000
    ) {
      capturedAt = parsed.toISOString();
    }
  }

  const lat = typeof raw.latitude === "number" ? raw.latitude : null;
  const lon = typeof raw.longitude === "number" ? raw.longitude : null;
  const bothValid =
    lat !== null &&
    lon !== null &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180;

  return {
    capturedAt,
    latitude: bothValid ? lat : null,
    longitude: bothValid ? lon : null,
  };
}

const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_EXIF_IFD_POINTER = 0x8769;
const TAG_GPS_IFD_POINTER = 0x8825;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LON_REF = 0x0003;
const TAG_GPS_LON = 0x0004;

const TYPE_BYTE_SIZE: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8, // SRATIONAL
};

interface Entry {
  tag: number;
  type: number;
  count: number;
  valueOffset: number;
}

/** Reads one IFD and returns its entries, or an empty list if it is malformed. */
function readIfd(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  little: boolean,
): Entry[] {
  const base = tiffStart + ifdOffset;
  if (base + 2 > view.byteLength) return [];

  const count = view.getUint16(base, little);
  const entries: Entry[] = [];

  for (let i = 0; i < count; i++) {
    const at = base + 2 + i * 12;
    if (at + 12 > view.byteLength) break;
    entries.push({
      tag: view.getUint16(at, little),
      type: view.getUint16(at + 2, little),
      count: view.getUint32(at + 4, little),
      valueOffset: at + 8,
    });
  }

  return entries;
}

/**
 * Where an entry's data actually lives. Values of four bytes or fewer sit in
 * the entry itself; anything larger stores an offset instead.
 */
function dataOffset(
  view: DataView,
  tiffStart: number,
  entry: Entry,
  little: boolean,
): number {
  const size = (TYPE_BYTE_SIZE[entry.type] ?? 0) * entry.count;
  if (size <= 4) return entry.valueOffset;
  return tiffStart + view.getUint32(entry.valueOffset, little);
}

function readAscii(
  view: DataView,
  tiffStart: number,
  entry: Entry,
  little: boolean,
): string | null {
  if (entry.type !== 2) return null;
  const start = dataOffset(view, tiffStart, entry, little);
  if (start + entry.count > view.byteLength) return null;

  let out = "";
  for (let i = 0; i < entry.count; i++) {
    const code = view.getUint8(start + i);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out.trim() || null;
}

/** Reads `n` RATIONAL values as numbers. */
function readRationals(
  view: DataView,
  tiffStart: number,
  entry: Entry,
  little: boolean,
  n: number,
): number[] | null {
  if (entry.type !== 5 || entry.count < n) return null;
  const start = dataOffset(view, tiffStart, entry, little);
  if (start + n * 8 > view.byteLength) return null;

  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const numerator = view.getUint32(start + i * 8, little);
    const denominator = view.getUint32(start + i * 8 + 4, little);
    if (denominator === 0) return null;
    out.push(numerator / denominator);
  }
  return out;
}

/**
 * EXIF stores dates as "YYYY:MM:DD HH:MM:SS" with no timezone. Converting to a
 * real instant would require inventing an offset, so it is read as the local
 * wall-clock time the camera recorded and kept as such.
 */
function parseExifDate(raw: string): string | null {
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;

  const [, year, month, day, hour, minute, second] = m;
  const date = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}Z`,
  );
  if (Number.isNaN(date.getTime())) return null;

  // A camera clock set decades wrong, or a date in the future, is a sign the
  // value is junk rather than evidence.
  const yearNum = Number(year);
  if (yearNum < 2000 || date.getTime() > Date.now() + 86_400_000) return null;

  return date.toISOString();
}

function degreesFrom(
  parts: number[] | null,
  ref: string | null,
): number | null {
  if (!parts || parts.length < 3 || !ref) return null;

  const [degrees, minutes, seconds] = parts;
  let value = degrees + minutes / 60 + seconds / 3600;

  const direction = ref.trim().toUpperCase().charAt(0);
  if (direction === "S" || direction === "W") value = -value;
  else if (direction !== "N" && direction !== "E") return null;

  if (!Number.isFinite(value) || Math.abs(value) > 180) return null;
  return Number(value.toFixed(6));
}

/**
 * Extracts capture time and coordinates from a JPEG's EXIF block.
 *
 * Returns nulls for anything it cannot read with confidence — a non-JPEG, a
 * photo stripped of metadata, or a structure it does not recognise.
 */
export function readJpegMetadata(buffer: ArrayBuffer): PhotoMetadata {
  const view = new DataView(buffer);
  if (view.byteLength < 4) return NO_METADATA;
  if (view.getUint16(0, false) !== 0xffd8) return NO_METADATA; // not a JPEG

  // Walk the marker segments looking for APP1 holding "Exif\0\0".
  let offset = 2;
  let tiffStart = -1;

  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;

    const marker = view.getUint8(offset + 1);
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda) break; // start of scan: pixel data from here on

    const length = view.getUint16(offset + 2, false);
    if (length < 2) break;

    if (marker === 0xe1 && offset + 4 + 6 <= view.byteLength) {
      const header = offset + 4;
      if (
        view.getUint32(header, false) === 0x45786966 && // "Exif"
        view.getUint16(header + 4, false) === 0x0000
      ) {
        tiffStart = header + 6;
        break;
      }
    }

    offset += 2 + length;
  }

  if (tiffStart < 0 || tiffStart + 8 > view.byteLength) return NO_METADATA;

  const byteOrder = view.getUint16(tiffStart, false);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return NO_METADATA;
  const little = byteOrder === 0x4949;

  if (view.getUint16(tiffStart + 2, little) !== 42) return NO_METADATA;

  const firstIfd = view.getUint32(tiffStart + 4, little);
  const root = readIfd(view, tiffStart, firstIfd, little);
  if (root.length === 0) return NO_METADATA;

  let capturedAt: string | null = null;
  let latitude: number | null = null;
  let longitude: number | null = null;

  for (const entry of root) {
    if (entry.tag === TAG_EXIF_IFD_POINTER) {
      const sub = readIfd(
        view,
        tiffStart,
        view.getUint32(entry.valueOffset, little),
        little,
      );
      for (const e of sub) {
        if (e.tag === TAG_DATETIME_ORIGINAL) {
          const raw = readAscii(view, tiffStart, e, little);
          if (raw) capturedAt = parseExifDate(raw);
        }
      }
    }

    if (entry.tag === TAG_GPS_IFD_POINTER) {
      const gps = readIfd(
        view,
        tiffStart,
        view.getUint32(entry.valueOffset, little),
        little,
      );

      let latRef: string | null = null;
      let lonRef: string | null = null;
      let latParts: number[] | null = null;
      let lonParts: number[] | null = null;

      for (const e of gps) {
        if (e.tag === TAG_GPS_LAT_REF) latRef = readAscii(view, tiffStart, e, little);
        if (e.tag === TAG_GPS_LON_REF) lonRef = readAscii(view, tiffStart, e, little);
        if (e.tag === TAG_GPS_LAT)
          latParts = readRationals(view, tiffStart, e, little, 3);
        if (e.tag === TAG_GPS_LON)
          lonParts = readRationals(view, tiffStart, e, little, 3);
      }

      const lat = degreesFrom(latParts, latRef);
      const lon = degreesFrom(lonParts, lonRef);

      // Both or neither: half a coordinate is not a location, and a stray zero
      // would place the plot in the Gulf of Guinea.
      if (lat !== null && lon !== null && Math.abs(lat) <= 90) {
        latitude = lat;
        longitude = lon;
      }
    }
  }

  return { capturedAt, latitude, longitude };
}
