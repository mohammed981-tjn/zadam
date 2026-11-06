import type { Locale } from "@/lib/i18n";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NO_METADATA, readJpegMetadata, type PhotoMetadata } from "@/lib/exif";

/**
 * A photo the phone app sends (backlog 203), put where the website's own upload puts it: the private `evidence`
 * bucket, under the sender's own id (the bucket's policy checks that first segment, and so do the database
 * functions that take the path), through the sender's own client — no elevated key.
 *
 * The website shrinks a photo in a canvas before it leaves the browser, which drops every EXIF tag, and reads the
 * capture time and place first so they can be kept as columns (src/lib/exif.ts). The app's picker shrinks the photo
 * too but keeps its EXIF block, the GPS position of the farm included. So the same happens here: the time and place
 * are read, then every metadata segment (or PNG text chunk) is removed before the file is stored — except the orientation, which says
 * which way up the pixels are; without it a phone photo would be stored on its side.
 */

/** The bucket's own limit. */
export const APP_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export type AppPhoto = { path: string; metadata: PhotoMetadata } | { error: string };

function typeOf(b: Uint8Array): "image/jpeg" | "image/png" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  return null;
}

/** The EXIF orientation (1–8) of a JPEG, or null when it carries none that can be read. */
export function jpegOrientation(b: Uint8Array): number | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marker = b[i + 1];
    if (marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
      i += marker === 0xff ? 1 : 2;
      continue;
    }
    const len = view.getUint16(i + 2, false);
    if (len < 2) return null;
    const header = i + 4;
    if (marker === 0xe1 && header + 14 <= b.length && view.getUint32(header, false) === 0x45786966) {
      const tiff = header + 6;
      const little = view.getUint16(tiff, false) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 > b.length) return null;
      const count = view.getUint16(ifd, little);
      for (let e = 0; e < count; e++) {
        const at = ifd + 2 + e * 12;
        if (at + 12 > b.length) break;
        if (view.getUint16(at, little) === 0x0112 && view.getUint16(at + 2, little) === 3) {
          const o = view.getUint16(at + 8, little);
          return o >= 1 && o <= 8 ? o : null;
        }
      }
      return null;
    }
    i += 2 + len;
  }
  return null;
}

/** A minimal APP1 segment holding the one tag kept: Orientation, big-endian. */
function orientationSegment(o: number): Uint8Array {
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, o, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const len = body.length + 2;
  return Uint8Array.from([0xff, 0xe1, len >> 8, len & 0xff, ...body]);
}

/**
 * The JPEG without its metadata: every APP1–APP15 segment (EXIF, XMP, ICC, maker data) and every comment goes; the
 * frame, the tables, the JFIF header and the pixels stay, and the orientation comes back as a one-tag EXIF block.
 * Returns null for a file whose structure it does not follow — refused rather than stored with what it carried.
 */
export function stripJpegMetadata(b: Uint8Array): Uint8Array | null {
  if (typeOf(b) !== "image/jpeg") return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const orientation = jpegOrientation(b);
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  if (orientation && orientation !== 1) parts.push(orientationSegment(orientation));
  let i = 2;
  for (;;) {
    if (i + 2 > b.length || b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xda) {
      parts.push(b.subarray(i)); // start of scan: the pixels, to the end
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > b.length) return null;
    const len = view.getUint16(i + 2, false);
    if (len < 2 || i + 2 + len > b.length) return null;
    const metadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!metadata) parts.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** PNG chunks that carry text or EXIF (place, time, software) rather than pixels. */
const PNG_METADATA = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

/** The PNG without its text and EXIF chunks; null for a structure it does not follow. */
export function stripPngMetadata(b: Uint8Array): Uint8Array | null {
  if (typeOf(b) !== "image/png") return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  for (;;) {
    if (i + 12 > b.length) return null;
    const len = view.getUint32(i, false);
    const end = i + 12 + len;
    if (end > b.length) return null;
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    if (!PNG_METADATA.has(type)) parts.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** base64 (a `data:` prefix allowed) to bytes; null when it is not text. */
export function photoBytes(raw: unknown): Uint8Array | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const b64 = raw.replace(/^data:[^,]*,/, "");
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) return null;
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/** Its refusals, said by uploadAppPhoto in Arabic as the website's form does, and their English twins (backlog 208). */
const PHOTO_ERRORS_EN: Record<string, string> = {
  "أرفق صورةً أوّلاً.": "Attach a photo first.",
  "الصورة أكبر من ١٠ ميجابايت.": "The photo is larger than 10 MB.",
  "صيغةٌ غير مقبولة. صوّر بالهاتف (JPG أو PNG).": "Format not accepted. Take a phone photo (JPG or PNG).",
  "تعذّرت قراءة الصورة. صوّرها مرّةً أخرى.": "Could not read the photo. Take it again.",
  "تعذّر رفع الصورة. أعد المحاولة.": "Could not upload the photo. Try again.",
};

/** A refusal of uploadAppPhoto in the language the app asked for. */
export const photoError = (locale: Locale, message: string) =>
  locale === "en" ? (PHOTO_ERRORS_EN[message] ?? message) : message;

/**
 * Stores the photo at `<user>/<folder>/<random id><suffix>.<jpg|png>` and hands back the path, and the capture time
 * and place a JPEG carried (for evidence, as the website keeps them).
 */
export async function uploadAppPhoto(
  supabase: SupabaseClient,
  userId: string,
  folder: string,
  raw: unknown,
  suffix = "",
): Promise<AppPhoto> {
  const bytes = photoBytes(raw);
  if (!bytes || bytes.length === 0) return { error: "أرفق صورةً أوّلاً." };
  if (bytes.length > APP_PHOTO_MAX_BYTES) return { error: "الصورة أكبر من ١٠ ميجابايت." };
  const type = typeOf(bytes);
  if (!type) return { error: "صيغةٌ غير مقبولة. صوّر بالهاتف (JPG أو PNG)." };

  let file = bytes;
  let metadata: PhotoMetadata = NO_METADATA;
  if (type === "image/jpeg") {
    metadata = readJpegMetadata(bytes.slice().buffer);
    const clean = stripJpegMetadata(bytes);
    if (!clean) return { error: "تعذّرت قراءة الصورة. صوّرها مرّةً أخرى." };
    file = clean;
  } else {
    const clean = stripPngMetadata(bytes);
    if (!clean) return { error: "تعذّرت قراءة الصورة. صوّرها مرّةً أخرى." };
    file = clean;
  }
  const path = `${userId}/${folder}/${randomUUID()}${suffix}.${type === "image/png" ? "png" : "jpg"}`;
  const { error } = await supabase.storage.from("evidence").upload(path, file, { contentType: type, upsert: false });
  if (error) {
    console.error("app photo: upload failed", error.message);
    return { error: "تعذّر رفع الصورة. أعد المحاولة." };
  }
  return { path, metadata };
}

/**
 * A PDF the app put in the sender's own folder itself (backlog 203), as the website's browser does: straight to the
 * `evidence` bucket with the person's own session, under `<user>/<folder>/<random id>.pdf`, the bucket holding it to
 * its ten megabytes and its list of types. A PDF carries no capture time or place to read, and the website stores it
 * as it is, so it does not come through here as a photo does; only its path does. Null for any other path — the
 * shared step then checks again that it is the sender's and that the file is there.
 */
export function ownPdfPath(userId: string, folder: string, raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = /^([0-9a-f-]{36})\/([a-z]+)\/([0-9a-f-]{36})\.pdf$/.exec(raw.trim());
  return m && m[1] === userId && m[2] === folder ? raw.trim() : null;
}

/**
 * A photo stored for a step the database then refused: removed again, so a refused handover or a refused piece of
 * evidence leaves no file behind. Best effort — the bucket's own rules decide, and a failure only leaves the file.
 */
export async function discardAppPhoto(supabase: SupabaseClient, path: string): Promise<void> {
  const { error } = await supabase.storage.from("evidence").remove([path]);
  if (error) console.error("app photo: could not remove a refused upload", error.message);
}
