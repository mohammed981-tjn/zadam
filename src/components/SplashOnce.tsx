"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

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

/** مفتاحُ التذكّر. تغييرُه يُعيد الشاشةَ لكلّ زائرٍ مرّةً واحدة. */
const SEEN_KEY = "sudagri:splash:v1";
const HOLD_MS = 1400;
const FADE_MS = 500;

export default function SplashOnce() {
  const ref = useRef<HTMLDivElement>(null);

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

    let fade = 0;
    let done = 0;

    const end = () => {
      el.classList.add("pointer-events-none", "opacity-0");
      window.clearTimeout(fade);
      done = window.setTimeout(() => {
        el.hidden = true;
      }, FADE_MS);
    };

    el.hidden = false;
    fade = window.setTimeout(end, HOLD_MS);
    el.addEventListener("pointerdown", end);
    window.addEventListener("keydown", end);

    return () => {
      window.clearTimeout(fade);
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
      <Image
        src="/sudagri-logo.png"
        alt=""
        width={680}
        height={680}
        priority
        sizes="(min-width: 640px) 360px, 72vw"
        className="w-[72vw] max-w-[360px] animate-[splash-in_700ms_ease-out_both]"
      />
      <p className="animate-[splash-in_700ms_200ms_ease-out_both] text-sm text-muted">
        منصّة سودانية للزراعة والتجارة
      </p>
    </div>
  );
}
