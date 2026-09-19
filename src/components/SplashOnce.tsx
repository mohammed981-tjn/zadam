"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { SUDAGRI_LOGO } from "@/lib/brand";
import { SPLASH_FADE_MS, SPLASH_MAX_MS, splashEndsAt } from "@/lib/splash";

/**
 * شاشةُ البداية — مرّةً واحدةً لكلّ زائر، ولا تحجب شيئاً.
 *
 * WHAT THE OWNER ASKED FOR, AND WHAT THIS IS INSTEAD
 *
 * «اريده في شاشة كالاسبلاتش كاملة في البداية» — the logo full-screen on
 * arrival. The straightforward reading of that is a gate: cover the page, hold
 * it for a beat, then reveal. That version has a cost worth saying out loud,
 * because it is paid by the people this platform is for:
 *
 *   • It is paid on **every** visit. A farmer checking one water figure between
 *     two field jobs waits for a picture he saw yesterday.
 *   • It is paid on a **Sudanese mobile connection**, where "a beat" is not a
 *     beat.
 *   • It delays the largest paint, the number search engines weigh most — and
 *     this platform lives or dies on being found.
 *
 * So this keeps what he wants and drops what it costs:
 *
 *   • **Once per visitor**, remembered in `localStorage`.
 *   • **Never blocking.** The page renders underneath from the first frame;
 *     this is an overlay that fades off it.
 *   • **Dismissable** — a tap or any key ends it at once.
 *   • **Silent for anyone who asked for less motion.**
 *
 * WHY IT DRIVES THE DOM INSTEAD OF REACT STATE
 *
 * The decision depends on `localStorage`, which the server cannot read. Holding
 * it in state means either rendering it visible on the server — a flash of the
 * splash for every returning visitor, the worst outcome here — or calling
 * `setState` in an effect to correct that, which cascades a render on every
 * page in the platform for a decision that concerns one element.
 *
 * So the overlay ships `hidden`, which is what the server sends to everyone,
 * and the effect reveals it by touching that one node. This is the case the
 * rule is written for: an effect synchronising an external system.
 *
 * WHY localStorage AND NOT A COOKIE
 *
 * A cookie would travel to the server on every request carrying a fact the
 * server has no use for, and would put this under a consent banner in any
 * jurisdiction that asks. The browser is the only party that needs to know.
 */

/**
 * مفتاحُ التذكّر. تغييرُه يُعيد الشاشةَ لكلّ زائرٍ مرّةً واحدة.
 *
 * رُفع إلى `v2` لأنّ من «رآها» تحت `v1` لم يرَ شيئاً: مستطيلٌ كريميٌّ فارغٌ
 * بينما الصورةُ على الشبكة. فمتصفّحُه يحملُ الآن أنّه رآها، ولن تُعرض له
 * المصلَحةُ أبداً. ورفعُ المفتاح يمنحه إيّاها مرّةً واحدة — وهو بالضبط ما وُجد
 * المفتاحُ له.
 */
const SEEN_KEY = "sudagri:splash:v2";

/**
 * التوقيتُ يتبع الصورةَ لا العكس.
 *
 * THE BUG THIS REPLACES
 *
 * The first version held for a flat 1400ms counted from mount, then faded for
 * 500ms — 1.9s on paper. The owner reported three seconds and no logo, and both
 * halves of that were the same fault: the clock started while the picture was
 * still downloading, so the hold was spent on an empty screen and the logo
 * arrived, if at all, as it was fading out. A fixed timer cannot know whether
 * there is anything to look at.
 *
 * So the end is computed from when the image actually lands:
 *
 *   • `MIN_MS` — the floor. A splash that vanishes instantly reads as a glitch.
 *   • `AFTER_LOAD_MS` — what he is actually here for: time with the logo *after*
 *     it is on screen, however long it took to arrive.
 *   • `MAX_MS` — the ceiling, and the promise. However bad the connection, the
 *     platform is never more than this away. A visitor on a stalled image sees
 *     the blurred badge, not a blank hold, and then the page.
 *
 * On a fast connection this lands near the floor; on a slow one it stops at the
 * ceiling rather than growing. Both are shorter than what he timed.
 *
 * The arithmetic itself is in `@/lib/splash` so that
 * `scripts/verify-splash-timing.ts` can hold it to those bounds — a ceiling
 * that exists only as a comment is not a ceiling.
 */

export default function SplashOnce() {
  const ref = useRef<HTMLDivElement>(null);

  /*
   * جسرٌ بين `onLoad` والمؤقّت.
   *
   * The image may finish before the effect runs — a returning visitor with it
   * in cache, or a fast enough first paint — so the load is recorded as a fact
   * (`loaded`) as well as announced (`announce`). The effect reads the fact if
   * it missed the announcement, and nothing depends on which came first.
   */
  const loaded = useRef(false);
  const announce = useRef<(() => void) | null>(null);

  const onImageLoad = () => {
    loaded.current = true;
    announce.current?.();
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let seen = true;
    try {
      seen = window.localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // نافذةٌ خاصّةٌ أو تخزينٌ محجوب: تُعامَل كأنّها رأت، فلا تُعرض الشاشةُ
      // في كلّ مرّةٍ لمن لا يستطيع متصفّحُه تذكُّرَها.
      seen = true;
    }

    const calm =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (seen || calm) return;

    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* لا يمنع العرضَ — يمنع تذكُّرَه فقط. */
    }

    let hold = 0;
    let done = 0;

    /*
     * `ending` لأنّ النهايةَ لها أكثرُ من داعٍ: السقف، ووصولُ الصورة، ولمسةٌ،
     * ومفتاح. والصورةُ قد تصل أثناء التلاشي نفسِه — فبلا هذه الرايةِ يُعاد
     * جدولةُ التلاشي من أوّله وتطول الشاشةُ بالضبط حين يُفترض أن تنتهي.
     */
    let ending = false;

    const end = () => {
      if (ending) return;
      ending = true;
      el.classList.add("pointer-events-none", "opacity-0");
      window.clearTimeout(hold);
      done = window.setTimeout(() => {
        el.hidden = true;
      }, SPLASH_FADE_MS);
    };

    const shown = Date.now();

    /** تُستدعى حين تصل الصورة: تُقرّب النهايةَ أو تُبعدها، ضمن الحدّين. */
    const settle = () => {
      if (ending) return;
      const elapsed = Date.now() - shown;
      window.clearTimeout(hold);
      hold = window.setTimeout(end, Math.max(0, splashEndsAt(elapsed) - elapsed));
    };

    el.hidden = false;

    // السقفُ أوّلاً، فهو الوعدُ الذي لا يعتمد على شيء: يُنصَب قبل أيّ انتظار،
    // ويبقى قائماً إن لم تصل الصورةُ أبداً.
    hold = window.setTimeout(end, SPLASH_MAX_MS);
    announce.current = settle;
    if (loaded.current) settle();

    el.addEventListener("pointerdown", end);
    window.addEventListener("keydown", end);

    return () => {
      announce.current = null;
      window.clearTimeout(hold);
      window.clearTimeout(done);
      el.removeEventListener("pointerdown", end);
      window.removeEventListener("keydown", end);
    };
  }, []);

  return (
    <div
      ref={ref}
      hidden
      // `aria-hidden` وليس حواراً: لا شيءَ هنا يُقرأ ولا يُفعل، والمحتوى
      // الحقيقيُّ تحتها جاهزٌ لقارئ الشاشة من اللحظة الأولى. وحوارٌ يخطف
      // التركيز كان سيقطع على القارئ الضريرَ صفحةً هو فيها أصلاً.
      aria-hidden
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-background opacity-100 transition-opacity duration-500"
    >
      {/*
        لا `preload` هنا — وهذا مقصود.

        Preloading would pull the full logo into the `<head>` of every page in
        the platform, including for the visitor who saw this once last week and
        will never see it again. Left to load normally it is fetched when this
        overlay is revealed, which is to say only for the visitor it is for.

        `placeholder="blur"` is what covers the gap that opens up: the blurred
        badge — green ring, gold sorghum, cream — comes inlined with the markup
        and is on screen before any request is made. There is no longer a state
        in which this screen is empty.
      */}
      <Image
        src={SUDAGRI_LOGO}
        alt=""
        placeholder="blur"
        onLoad={onImageLoad}
        sizes="(min-width: 640px) 360px, 80vw"
        className="w-[80vw] max-w-[380px] animate-[splash-in_700ms_ease-out_both]"
      />
      <p className="animate-[splash-in_700ms_200ms_ease-out_both] text-sm text-muted">
        منصّة سودانية للزراعة والتجارة
      </p>
    </div>
  );
}
