"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { SUDAGRI_LOGO } from "@/lib/brand";
import { tr } from "@/lib/i18n";
import { useLocale } from "./LocaleProvider";
import {
  SPLASH_FADE_MS,
  SPLASH_MAX_MS,
  SPLASH_VIDEO_MAX_MS,
  SPLASH_VIDEO_START_MS,
  splashEndsAt,
} from "@/lib/splash";
import { SLIDES } from "@/lib/introSlides";

/**
 * شاشةُ البداية — مرّةً لأوّل زيارةٍ للرئيسيّة، وشاشاتُ التعريف ثابتةٌ حتى يلمسها الزائر.
 *
 * The owner, 3 November 2026 (audit question 11): «مرّة لأوّل زيارة للرئيسية». On every load it cost about 1 MB and
 * five taps before any page, deep links and returns from sign-in included. So it shows once on this browser, only when
 * the visit opens on the home page and the connection has not asked to save data; «تخطَّ» shows from the first moment
 * and, like Escape, closes the whole intro. Its four screens still wait for a tap (26 October: «ثابتة بمعنى لا تتغيّر
 * تلقائيّاً إلّا بعد الضغط عليها»), and the clip and the logo before them still run by themselves. What follows is the
 * reasoning of the first once-per-visitor version, kept for the record of what it weighed.
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

/** Seen once on this browser (owner, 3 November 2026: «مرّة لأوّل زيارة للرئيسية»). */
const SEEN_KEY = "sudagri.intro.seen";

/**
 * Whether this load may show the intro: the home page, a first visit, and a connection that has not asked to save data
 * (audit perf-seo-a11y-1: on every load it cost about 1 MB and five taps before any page, deep links and sign-in returns
 * included). Read once, on the client.
 */
function introWanted(pathname: string): boolean {
  if (pathname !== "/") return false;
  try {
    if (window.localStorage.getItem(SEEN_KEY)) return false;
  } catch {
    // Storage refused (a private window): show it, and it will show again next time.
  }
  const net = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (net?.saveData || net?.effectiveType === "slow-2g" || net?.effectiveType === "2g") return false;
  return true;
}

export default function SplashOnce() {
  const locale = useLocale();
  const pathname = usePathname();
  // The slides' photos are fetched only when their screen is reached, not all four the moment the intro opens.
  const [reached, setReached] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<HTMLDivElement>(null);

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
  /*
   * The decision, made once for this load. React's development mode runs the effect, undoes it and runs it again; the
   * second run would read the «seen» mark the first one wrote and close an intro that has just opened.
   */
  const wanted = useRef<boolean | null>(null);

  const onImageLoad = () => {
    loaded.current = true;
    announce.current?.();
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    wanted.current ??= introWanted(pathname);
    if (!wanted.current) {
      window.dispatchEvent(new Event("sudagri:intro-done"));
      return;
    }
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // As above.
    }

    // A reader who asked for less motion skips the clip and starts at the logo.
    const calm =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
      videoRef.current?.pause();
      done = window.setTimeout(() => {
        el.hidden = true;
        // Gone for this visit: a film mounted later (back to the home page) must not wait for it.
        delete document.documentElement.dataset.intro;
        // The homepage film waits for this rather than playing unseen beneath.
        window.dispatchEvent(new Event("sudagri:intro-done"));
      }, SPLASH_FADE_MS);
    };

    let shown = 0;
    let sliding = false;
    let current = -1;

    /*
     * من الشعار إلى شاشات التعريف (البند ٢٠٠): كلُّ شاشةٍ ثابتةٌ حتى يلمسها الزائر (المالك، 26 أكتوبر)، فتأتي التالية،
     * وبعد الأخيرة تنتهي المقدّمة.
     */
    const slides = slidesRef.current;
    const showSlide = (i: number) => {
      current = i;
      setReached((r) => Math.max(r, i));
      slides?.querySelectorAll<HTMLElement>("[data-slide]").forEach((n) => {
        n.classList.toggle("opacity-0", Number(n.dataset.slide) !== i);
      });
      slides?.querySelectorAll<HTMLElement>("[data-dot]").forEach((n) => {
        n.classList.toggle("bg-white", Number(n.dataset.dot) === i);
        n.classList.toggle("bg-white/35", Number(n.dataset.dot) !== i);
      });
    };
    const toSlides = () => {
      if (ending || sliding) return;
      sliding = true;
      window.clearTimeout(hold);
      if (!slides) return end();
      logo?.classList.add("opacity-0");
      slides.classList.remove("opacity-0");
      showSlide(0);
    };

    /** تُستدعى حين تصل الصورة: تُقرّب النهايةَ أو تُبعدها، ضمن الحدّين. */
    const settle = () => {
      if (ending || !shown || sliding) return;
      const elapsed = Date.now() - shown;
      window.clearTimeout(hold);
      hold = window.setTimeout(toSlides, Math.max(0, splashEndsAt(elapsed) - elapsed));
    };

    /*
     * من الفيديو إلى الشعار. يُستدعى حين ينتهي المقطع، أو يتعثّر، أو لا يبدأ
     * خلال `SPLASH_VIDEO_START_MS`، أو يبلغ `SPLASH_VIDEO_MAX_MS` — أيُّها
     * أسبق، ومرّةً واحدة. ومن هنا تبدأ ساعةُ شاشة الشعار كما كانت.
     */
    const video = videoRef.current;
    const logo = logoRef.current;
    let started = 0;
    let cap = 0;
    const toLogo = () => {
      if (ending || shown) return;
      window.clearTimeout(started);
      window.clearTimeout(cap);
      shown = Date.now();
      video?.classList.add("opacity-0");
      video?.pause();
      logo?.classList.remove("opacity-0");
      hold = window.setTimeout(toSlides, SPLASH_MAX_MS);
      announce.current = settle;
      if (loaded.current) settle();
    };

    // الإطارُ في الرئيسيّة يقرأ هذه فينتظر نهاية المقدّمة قبل أن يعرض فيلمه.
    document.documentElement.dataset.intro = "1";
    el.hidden = false;

    if (video && !calm) {
      video.addEventListener("ended", toLogo);
      video.addEventListener("error", toLogo, true);
      video.addEventListener("playing", () => window.clearTimeout(started), { once: true });
      started = window.setTimeout(toLogo, SPLASH_VIDEO_START_MS);
      cap = window.setTimeout(toLogo, SPLASH_VIDEO_MAX_MS);
      video.play().catch(toLogo);
    } else {
      toLogo();
    }

    /** A tap or a key: the clip to the logo, the logo to the first screen, each screen to the next, the last away. */
    const advance = () => {
      if (ending) return;
      if (!shown) toLogo();
      else if (!sliding) toSlides();
      else if (current + 1 < SLIDES.length) showSlide(current + 1);
      else end();
    };
    /*
     * «تخطَّ» أو Escape تُغلق المقدّمة كلّها (فحص 3 نوفمبر، perf-seo-a11y-1؛ وكانت تتخطّى إلى الشاشات وحدها). والزرّ ظاهرٌ
     * من أوّل لحظةٍ إلى آخر شاشة.
     */
    const skip = () => end();
    const onTap = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest("[data-skip]")) skip();
      else advance();
    };
    // Escape closes; Enter, Space and the arrows go on. Tab moves focus as it always does.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
      // Enter or Space on «تخطَّ» itself is the button's own click (below), not the next screen.
      else if ((e.target as HTMLElement | null)?.closest?.("[data-skip]")) return;
      else if (["Enter", " ", "ArrowLeft", "ArrowRight"].includes(e.key)) advance();
    };
    // The keyboard's Enter or Space and a screen reader's «activate» reach the button as a click, not a pointerdown.
    const skipButton = el.querySelector<HTMLButtonElement>("[data-skip]");
    skipButton?.addEventListener("click", skip);
    el.addEventListener("pointerdown", onTap);
    window.addEventListener("keydown", onKey);

    return () => {
      // تفكيكٌ قبل أن تنتهي المقدّمة (وهو ما يفعله React في وضع التطوير الصارم): تُخفى، فيعرضها الأثرُ التالي من أوّلها.
      if (!ending) {
        el.hidden = true;
        delete document.documentElement.dataset.intro;
      }
      // ولا يعمل بعدها شيءٌ من هذا الأثر: رفضُ `play()` قد يصل بعد التفكيك فيقلب الشاشات تحت الأثر التالي.
      ending = true;
      announce.current = null;
      window.clearTimeout(hold);
      window.clearTimeout(started);
      window.clearTimeout(cap);
      video?.removeEventListener("ended", toLogo);
      video?.removeEventListener("error", toLogo, true);
      window.clearTimeout(done);
      el.removeEventListener("pointerdown", onTap);
      window.removeEventListener("keydown", onKey);
      skipButton?.removeEventListener("click", skip);
    };
    // The path is read once: the intro is for the page the visit opened on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      hidden
      // حوارٌ له اسم، لا `aria-hidden`: فيه زرٌّ يُضغط («تخطَّ»)، وما فيه زرٌّ لا يُخفى عن قارئ الشاشة (perf-seo-a11y-1).
      role="dialog"
      aria-modal="true"
      aria-label={tr(locale, "مقدّمة سوداقري", "Sudagri introduction")}
      // داكنٌ دائماً (المالك، 12 أكتوبر: «يتغيّر مع الألوان الجديدة الغامقة») — يكمل شاشةَ
      // النظام الافتتاحيّة الداكنة في `manifest.ts` بلا ومضة.
      className="fixed inset-0 z-[110] bg-[#10160f] opacity-100 transition-opacity duration-500"
    >
      {/*
        المرحلةُ الأولى: فيديو المزارع على الشاشة كاملة. `preload="none"` لأنّ
        الغطاءَ نفسَه يُرسَل لكلّ زائر؛ والمقطعُ يُطلب فقط حين يُشغَّل، أي فقط
        لمن هو له. وبلا `autoPlay` للسبب نفسه: التشغيلُ من الأثر، بعد التحقّق.
      */}
      <video
        ref={videoRef}
        muted
        playsInline
        preload="none"
        poster="/video/sudan-farmer.jpg"
        className="absolute inset-0 h-full w-full bg-black object-cover transition-opacity duration-500"
      >
        <source src="/video/sudan-farmer.webm" type="video/webm" />
        <source src="/video/sudan-farmer.mp4" type="video/mp4" />
      </video>

      {/* المرحلةُ الثانية: الشعار، يظهر فوق المقطع حين ينتهي. */}
      <div
        ref={logoRef}
        className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-[#10160f] opacity-0 transition-opacity duration-500"
      >
        {/* صحنٌ كريميّ خلف الشعار: أخضرُ «سوداقري» لا يُقرأ على الداكن وحده. */}
        <div className="rounded-full bg-[#f7f5ef] p-[4%] shadow-2xl">
          <Image
            src={SUDAGRI_LOGO}
            alt=""
            placeholder="blur"
            onLoad={onImageLoad}
            sizes="(min-width: 640px) 360px, 80vw"
            className="w-[76vw] max-w-[360px]"
          />
        </div>
        <p className="text-sm text-[#e8e6dc]">
          {tr(locale, "منصّة سودانية للزراعة والتجارة", "A Sudanese platform for agriculture and trade")}
        </p>
      </div>

      {/* المرحلةُ الثالثة: أربعُ شاشاتٍ تعرّف بالمنصّة، كلٌّ ثابتةٌ حتى اللمس. */}
      <div ref={slidesRef} className="absolute inset-0 opacity-0 transition-opacity duration-500">
        {SLIDES.map((s, i) => (
          <div
            key={s.photo}
            data-slide={i}
            className="absolute inset-0 opacity-0 transition-opacity duration-700"
          >
            {reached >= i && <Image src={s.photo} alt="" fill sizes="100vw" className="object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a1a12] via-[#0a1a12]/70 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 mx-auto max-w-2xl px-6 pb-20 text-center text-white sm:pb-24">
              <p className="mb-3 text-sm font-medium text-[#f6b26b]">
                {i + 1} / {SLIDES.length}
              </p>
              <h2 className="text-3xl font-black leading-tight sm:text-5xl">{tr(locale, ...s.title)}</h2>
              <p className="mt-4 text-lg leading-relaxed text-white/90 sm:text-2xl">{tr(locale, ...s.body)}</p>
            </div>
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-8 flex justify-center gap-2">
          {SLIDES.map((s, i) => (
            <span key={s.photo} data-dot={i} className="h-2 w-8 rounded-full bg-white/35 transition-colors" />
          ))}
        </div>
      </div>

      <span className="absolute top-5 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-xs text-white">
        {tr(locale, "المس الشاشة للتالي", "Tap the screen for the next")}
      </span>
      <button
        type="button"
        data-skip
        className="absolute top-4 end-4 rounded-full bg-black/50 px-4 py-1.5 text-sm font-bold text-white"
      >
        {tr(locale, "تخطَّ ✕", "Skip ✕")}
      </button>
    </div>
  );
}
