/**
 * توقيتُ شاشة البداية — حسابٌ مستقلٌّ عن الشاشة، ليكون قابلاً للفحص.
 *
 * WHY THIS IS NOT INSIDE THE COMPONENT
 *
 * The owner's report was that the splash lasted three seconds and showed him
 * nothing. The first half of that is a promise this file now has to keep: the
 * platform is never more than `SPLASH_MAX_MS` away, whatever the connection
 * does. A promise made only in a comment inside an effect cannot be checked by
 * anything, and this is the kind of promise that breaks quietly — a later edit
 * adds the load time to the hold instead of clamping it, nobody notices on a
 * fast machine, and the people it fails are the ones on the slow ones.
 *
 * So the arithmetic lives here as a pure function, and
 * `scripts/verify-splash-timing.ts` holds it to the bounds.
 */

/** أقلُّ ما تبقى على الشاشة — أقلُّ منه يُقرأ ومضةً لا ترحيباً. */
export const SPLASH_MIN_MS = 800;

/** ما يُمنح للنظر إلى الشعار بعد وصوله فعلاً، لا بعد طلبه. */
export const SPLASH_AFTER_LOAD_MS = 500;

/** السقف. الوعدُ الذي لا تنقضه شبكةٌ بطيئة ولا صورةٌ لا تصل أبداً. */
export const SPLASH_MAX_MS = 2000;

/** زمنُ التلاشي بعد انتهاء المهلة. */
export const SPLASH_FADE_MS = 400;

/*
 * مرحلةُ الفيديو قبل الشعار (طلب المالك، 25 سبتمبر: «يندمج شاشة البداية مع
 * الفيديو بحيث عندما ينتهي الفيديو تظهر شاشة البداية»).
 *
 * The intro now opens on the owner's 8-second clip and the logo screen follows
 * it. The promises above still hold for the logo screen; these two bound the
 * clip in front of it, so the whole intro keeps a ceiling:
 *
 *   • `VIDEO_START_MS` — if the clip has not started playing by then (a slow
 *     connection, a browser that will not autoplay), the logo screen comes
 *     straight away. A stalled video is never a blank screen to wait out.
 *   • `VIDEO_MAX_MS` — the clip's own length and a little over, so it is not
 *     cut short, and not a moment more if it stalls midway.
 *
 * A tap or a key moves the intro on a step (26 October); «تخطَّ» or Escape closes it at any point.
 */
export const SPLASH_VIDEO_START_MS = 2500;
export const SPLASH_VIDEO_MAX_MS = 9000;

/*
 * ثمّ شاشاتُ التعريف بعد الشعار (البند ٢٠٠؛ المالك، 25 أكتوبر 2026: «ثلاث اسبلاشات او أربعة في البداية قبل ما يفتح
 * التطبيق تشرح ماتقدمه المنصة»). Until 26 October each turned after three seconds; since then each stays until it is
 * tapped (the owner: «ثابتة… لا تتغيّر تلقائيّاً إلّا بعد الضغط عليها»), so they have no clock of their own, and the
 * homepage films wait for the intro to be closed, however long that is.
 */
export const SPLASH_SLIDES = 4;

/**
 * متى تنتهي الشاشة، بالمللي ثانية من لحظة ظهورها.
 *
 * @param loadedAfterMs زمنُ وصول الصورة من لحظة الظهور، أو `null` إن لم تصل بعد.
 *
 * Clamped rather than summed, which is the whole point: a slow image cannot
 * push the end past the ceiling, and a cached one cannot pull it below the
 * floor. An image that never arrives ends at the ceiling — the visitor sees the
 * blurred badge rather than a blank hold, and then the page.
 */
export function splashEndsAt(loadedAfterMs: number | null): number {
  if (loadedAfterMs === null) return SPLASH_MAX_MS;
  return Math.min(
    SPLASH_MAX_MS,
    Math.max(SPLASH_MIN_MS, loadedAfterMs + SPLASH_AFTER_LOAD_MS),
  );
}
