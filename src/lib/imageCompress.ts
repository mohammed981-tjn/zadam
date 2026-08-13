/**
 * Shrinking a photo in the browser before it is uploaded.
 *
 * Two reasons, and the second matters more in Sudan than the first. Storage is
 * the platform's binding constraint — a gigabyte holds about a hundred
 * ten-megabyte photos, which is roughly fifteen real farming seasons' worth of
 * evidence. And a farmer uploading from a phone on a weak connection is waiting
 * on every byte; a four-megabyte photo that becomes four hundred kilobytes is
 * the difference between an upload that completes and one that is abandoned.
 *
 * A twelve-megapixel phone photo carries far more detail than any reviewer of a
 * field photo needs. Capping the long edge and re-encoding keeps everything the
 * evidence is for while discarding what only costs money.
 *
 * What this deliberately does not do: touch PDFs, or upload a re-encoded file
 * when re-encoding made it larger, or fail the upload when it cannot decode the
 * image. In every uncertain case the original is used.
 */

/** Long edge in pixels. A field photo is legible far below a phone's native size. */
const MAX_EDGE = 1600;
const QUALITY = 0.82;
/** Below this, the saving is not worth a re-encode that loses a little quality. */
const SKIP_BELOW_BYTES = 400 * 1024;

export interface CompressionResult {
  file: File;
  /** False when the original was returned untouched. */
  compressed: boolean;
  originalBytes: number;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Returns a smaller version of an image file, or the original when shrinking is
 * impossible or pointless.
 *
 * HEIC is the case worth naming: most browsers cannot decode it, so the decode
 * throws and the original is uploaded unchanged. That is the correct outcome —
 * the file is still valid evidence, it just does not get the saving.
 */
export async function compressImage(file: File): Promise<CompressionResult> {
  const originalBytes = file.size;
  const untouched: CompressionResult = {
    file,
    compressed: false,
    originalBytes,
  };

  if (!file.type.startsWith("image/")) return untouched;
  if (file.size <= SKIP_BELOW_BYTES) return untouched;
  if (typeof createImageBitmap !== "function") return untouched;

  let bitmap: ImageBitmap;
  try {
    // from-image applies the EXIF orientation tag, without which photos taken
    // in portrait arrive on their side.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return untouched;
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    if (width < 1 || height < 1) return untouched;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return untouched;
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, "image/jpeg", QUALITY);
    if (!blob || blob.size >= originalBytes) return untouched;

    return {
      file: new File([blob], "photo.jpg", { type: "image/jpeg" }),
      compressed: true,
      originalBytes,
    };
  } catch {
    return untouched;
  } finally {
    bitmap.close();
  }
}
