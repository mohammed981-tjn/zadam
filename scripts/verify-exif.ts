import {
  readJpegMetadata,
  sanitisePhotoMetadata,
  NO_METADATA,
} from "../src/lib/exif";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

/*
 * Builds a real JPEG byte for byte: SOI, an APP1 segment holding a TIFF header,
 * a root IFD pointing at an EXIF sub-IFD and a GPS sub-IFD, then EOI. Testing
 * the parser against a hand-built file is the only way to know it reads offsets
 * correctly rather than happening to work on one camera's output.
 */
function buildJpeg(opts: {
  little?: boolean;
  dateTime?: string | null;
  gps?: { lat: [number, number, number]; latRef: string; lon: [number, number, number]; lonRef: string } | null;
}): ArrayBuffer {
  const little = opts.little ?? true;
  const body: number[] = [];

  // The TIFF block is assembled in its own array so every offset below is
  // relative to its start, exactly as the format requires.
  const tiff: number[] = [];
  const u16 = (v: number) =>
    little ? [v & 0xff, (v >> 8) & 0xff] : [(v >> 8) & 0xff, v & 0xff];
  const u32 = (v: number) =>
    little
      ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]
      : [(v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];

  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]));
  tiff.push(...u16(42));
  tiff.push(...u32(8)); // first IFD immediately after the header

  const rootEntries: number[][] = [];
  const heap: number[] = [];
  // Root IFD: 2 count bytes + 12 per entry + 4 next-pointer.
  const entryCount = (opts.dateTime !== null ? 1 : 0) + (opts.gps ? 1 : 0);
  const heapStart = 8 + 2 + entryCount * 12 + 4;

  let exifIfdOffset = 0;
  let gpsIfdOffset = 0;

  if (opts.dateTime !== null) {
    const text = opts.dateTime ?? "2026:03:14 09:30:00";
    const ascii = [...text].map((c) => c.charCodeAt(0));
    ascii.push(0);

    exifIfdOffset = heapStart + heap.length;
    // One entry, whose ASCII value is too long for the inline slot.
    const valueOffset = exifIfdOffset + 2 + 12 + 4;
    heap.push(...u16(1));
    heap.push(...u16(0x9003), ...u16(2), ...u32(ascii.length), ...u32(valueOffset));
    heap.push(...u32(0)); // no next IFD
    heap.push(...ascii);
    while (heap.length % 2 !== 0) heap.push(0);
  }

  if (opts.gps) {
    gpsIfdOffset = heapStart + heap.length;
    const gpsEntryCount = 4;
    const valuesStart = gpsIfdOffset + 2 + gpsEntryCount * 12 + 4;

    const latBytes: number[] = [];
    for (const v of opts.gps.lat) latBytes.push(...u32(Math.round(v * 100)), ...u32(100));
    const lonBytes: number[] = [];
    for (const v of opts.gps.lon) lonBytes.push(...u32(Math.round(v * 100)), ...u32(100));

    const latOffset = valuesStart;
    const lonOffset = latOffset + latBytes.length;

    const inlineAscii = (s: string) => {
      const b = [s.charCodeAt(0), 0, 0, 0];
      return b;
    };

    heap.push(...u16(gpsEntryCount));
    // Refs are two bytes (letter + NUL) so they sit inline in the entry.
    heap.push(...u16(0x0001), ...u16(2), ...u32(2), ...inlineAscii(opts.gps.latRef));
    heap.push(...u16(0x0002), ...u16(5), ...u32(3), ...u32(latOffset));
    heap.push(...u16(0x0003), ...u16(2), ...u32(2), ...inlineAscii(opts.gps.lonRef));
    heap.push(...u16(0x0004), ...u16(5), ...u32(3), ...u32(lonOffset));
    heap.push(...u32(0));
    heap.push(...latBytes, ...lonBytes);
  }

  if (exifIfdOffset) rootEntries.push([...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfdOffset)]);
  if (gpsIfdOffset) rootEntries.push([...u16(0x8825), ...u16(4), ...u32(1), ...u32(gpsIfdOffset)]);

  tiff.push(...u16(rootEntries.length));
  for (const e of rootEntries) tiff.push(...e);
  tiff.push(...u32(0));
  tiff.push(...heap);

  const app1Payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const app1Length = app1Payload.length + 2;

  body.push(0xff, 0xd8); // SOI
  body.push(0xff, 0xe1, (app1Length >> 8) & 0xff, app1Length & 0xff);
  body.push(...app1Payload);
  body.push(0xff, 0xd9); // EOI

  return new Uint8Array(body).buffer;
}

console.log("\nقراءة بيانات الصورة قبل الضغط\n");

console.log("التاريخ:");
{
  const m = readJpegMetadata(buildJpeg({ dateTime: "2026:03:14 09:30:00", gps: null }));
  ok(m.capturedAt === "2026-03-14T09:30:00.000Z", "يُقرأ تاريخ الالتقاط من EXIF");

  const big = readJpegMetadata(
    buildJpeg({ little: false, dateTime: "2026:03:14 09:30:00", gps: null }),
  );
  ok(
    big.capturedAt === "2026-03-14T09:30:00.000Z",
    "يُقرأ بترتيب البايتات الكبير أيضاً (Motorola)",
  );

  const old = readJpegMetadata(buildJpeg({ dateTime: "1980:01:01 00:00:00", gps: null }));
  ok(old.capturedAt === null, "ساعة كاميرا مضبوطة على سنة مستحيلة تُرفض");

  const future = readJpegMetadata(buildJpeg({ dateTime: "2099:01:01 00:00:00", gps: null }));
  ok(future.capturedAt === null, "تاريخ في المستقبل يُرفض");
}

console.log("\nالإحداثيات:");
{
  // الخرطوم تقريباً: 15°36′N 32°32′E
  const m = readJpegMetadata(
    buildJpeg({
      dateTime: null,
      gps: { lat: [15, 36, 0], latRef: "N", lon: [32, 32, 0], lonRef: "E" },
    }),
  );
  ok(m.latitude !== null && Math.abs(m.latitude - 15.6) < 0.001, "خط العرض يُحسب من درجة ودقيقة وثانية");
  ok(m.longitude !== null && Math.abs(m.longitude - 32.5333) < 0.001, "خط الطول يُحسب صحيحاً");

  const south = readJpegMetadata(
    buildJpeg({
      dateTime: null,
      gps: { lat: [15, 36, 0], latRef: "S", lon: [32, 32, 0], lonRef: "W" },
    }),
  );
  ok(
    south.latitude !== null && south.latitude < 0 && south.longitude !== null && south.longitude < 0,
    "جنوب وغرب تعطيان قيمة سالبة",
  );

  const bad = readJpegMetadata(
    buildJpeg({
      dateTime: null,
      gps: { lat: [15, 36, 0], latRef: "X", lon: [32, 32, 0], lonRef: "E" },
    }),
  );
  ok(
    bad.latitude === null && bad.longitude === null,
    "اتجاه غير معروف يُلغي الإحداثيات كلها لا نصفها",
  );
}

console.log("\nالرفض الآمن:");
{
  ok(
    readJpegMetadata(new Uint8Array([1, 2, 3, 4]).buffer).capturedAt === null,
    "ملف ليس JPEG لا يُنتج بيانات",
  );
  ok(
    readJpegMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer).latitude === null,
    "JPEG بلا EXIF يُرجع قيماً فارغة لا خطأ",
  );

  const both = readJpegMetadata(
    buildJpeg({
      dateTime: "2026:03:14 09:30:00",
      gps: { lat: [15, 36, 0], latRef: "N", lon: [32, 32, 0], lonRef: "E" },
    }),
  );
  ok(
    both.capturedAt !== null && both.latitude !== null,
    "التاريخ والإحداثيات يُقرآن معاً من نفس الملف",
  );
}

console.log("\nتنقية ما يصل من المتصفح:");
{
  ok(
    sanitisePhotoMetadata(null).capturedAt === null,
    "قيمة فارغة تُقبل وتُصبح لا شيء",
  );
  ok(
    sanitisePhotoMetadata({ latitude: 15.6, longitude: 32.5 }).latitude === 15.6,
    "زوج إحداثيات صالح يمر",
  );
  ok(
    sanitisePhotoMetadata({ latitude: 15.6, longitude: null }).latitude === null,
    "نصف زوج يُرفض — نصف إحداثي ليس موقعاً",
  );
  ok(
    sanitisePhotoMetadata({ latitude: 999, longitude: 32 }).latitude === null,
    "خط عرض خارج المدى يُرفض",
  );
  ok(
    sanitisePhotoMetadata({ capturedAt: "ليس تاريخاً" }).capturedAt === null,
    "نص ليس تاريخاً يُرفض بلا انهيار",
  );
  ok(
    sanitisePhotoMetadata(NO_METADATA).longitude === null,
    "الحالة الفارغة تمر كما هي",
  );
}

console.log(`\n${fail === 0 ? "كل الفحوص نجحت" : `${fail} فحص فشل`}\n`);
process.exit(fail === 0 ? 0 : 1);
