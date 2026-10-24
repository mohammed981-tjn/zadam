"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { sendLead } from "@/lib/leads";
import { OPEN_ASSISTANT_EVENT } from "@/lib/events";
import { useDraggable } from "@/lib/useDraggable";
import { tr } from "@/lib/i18n";
import { collectTranscript, recognitionCtor, speechErrorText, speechLang, type RecognitionLike } from "@/lib/speech";
import { brandForSpeech } from "@/lib/speechName";
import { useLocale } from "./LocaleProvider";

type Msg = { role: "user" | "assistant"; text: string; source?: string; image?: string };

/** The photo as it goes to the server (base64 JPEG) and as it is shown back (a data URL). */
type Photo = { mime: string; data: string; preview: string };

/**
 * «صوّر وأسأل»: the phone's camera photo is a few megabytes, and the farmer is
 * on a weak connection. Drawn onto a canvas no wider than PHOTO_MAX_PX and
 * re-encoded as JPEG, it becomes a couple of hundred kilobytes — enough for a
 * model to read a leaf, small enough to send from the field.
 */
const PHOTO_MAX_PX = 1024;

async function shrinkPhoto(file: File): Promise<Photo> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("unreadable image"));
      el.src = url;
    });
    const scale = Math.min(1, PHOTO_MAX_PX / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL("image/jpeg", 0.75);
    return { mime: "image/jpeg", data: preview.slice(preview.indexOf(",") + 1), preview };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Reads an answer aloud with the phone's own Arabic voice, when it has one; false when it has none. */
function speak(text: string, lang: string): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(lang.startsWith("ar") ? brandForSpeech(text) : text);
  u.lang = lang;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
  return true;
}

/*
 * Where the answer came from, shown under it.
 *
 * A computed number, a quote from a reviewed entry, and a general-purpose
 * model's recollection carry very different weight, and the platform stakes its
 * credibility on not blurring them. The model is labelled as outside knowledge
 * rather than left unmarked; a cached answer is a model answer served twice, so
 * it carries the same label.
 */
const SOURCE_LABEL: Record<string, string> = {
  calculator: "محسوبة داخل المنصة بمنهجية FAO-56",
  canal: "من ملفّ القناة القوسية في قاعدة سوداقري",
  market: "من قاعدة FAOSTAT المحمَّلة في المنصّة",
  climate: "متوسّطات مناخية مقيسة — NASA POWER",
  knowledge: "من قاعدة معرفة سوداقري المراجَعة",
  platform: "من حالة المنصة الحالية",
  cache: "معرفة عامة خارج قاعدة سوداقري المتحقَّقة",
  model: "معرفة عامة خارج قاعدة سوداقري المتحقَّقة",
  photo: "قراءةٌ عامّة للصورة بنموذج ذكاء اصطناعيّ — ليست تشخيصاً؛ الفحص للمرشد الزراعيّ أو الطبيب البيطريّ",
};

const SOURCE_LABEL_EN: Record<string, string> = {
  calculator: "Calculated on the platform with the FAO-56 method",
  canal: "From the Arc Canal file in the Sudagri base",
  market: "From the FAOSTAT data loaded on the platform",
  climate: "Measured climate averages — NASA POWER",
  knowledge: "From Sudagri's reviewed knowledge base",
  platform: "From the platform's current state",
  cache: "General knowledge outside Sudagri's verified base",
  model: "General knowledge outside Sudagri's verified base",
  photo: "A general AI reading of the photo — not a diagnosis; the extension officer or the vet examines",
};

export default function AssistantWidget() {
  const pathname = usePathname();
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const [open, setOpen] = useState(false);
  /**
   * The button steps aside while someone is filling in a form elsewhere on the
   * page, and on the sign-in screen altogether (the review of 23 October: it
   * sat over the button that creates the account). The keyboard is up then,
   * and the form's own button is the one thing that should be pressed.
   * And on the maps screen, which fills the phone: there it sat on the map's
   * colour key (24 October).
   */
  const [typing, setTyping] = useState(false);
  const formPage = /^\/(login|signup|reset|map)(\/|$)/.test(pathname ?? "");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<RecognitionLike | null>(null);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadResult, setLeadResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const {
    ref: dragRef,
    offset,
    dragging,
    onPointerDown,
    consumeDrag,
  } = useDraggable("sudagri:assistant-position");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, showLeadForm]);

  // The menu can open the assistant from any page, so a visitor who never
  // notices the floating button still has a way in.
  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener(OPEN_ASSISTANT_EVENT, openIt);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, openIt);
  }, []);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      setPhoto(await shrinkPhoto(file));
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: t("تعذّرت قراءة هذه الصورة. جرّب صورة أخرى.", "This photo could not be read. Try another.") }]);
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /*
   * «قُل سؤالك»: one press starts the phone's own recogniser, what it hears
   * lands in the box as it is heard, and a second press (or silence) stops
   * it. The farmer still presses Send — a misheard word is a wrong answer,
   * and the box is where it gets corrected.
   */
  function toggleListening() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setMessages((m) => [...m, { role: "assistant", text: t("هذا المتصفّح لا يسمع الصوت. جرّب متصفّح كروم.", "This browser cannot take dictation. Try the Chrome browser.") }]);
      return;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    const rec = new Ctor();
    rec.lang = speechLang(locale);
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => setInput(collectTranscript(e.results));
    rec.onerror = (e) => {
      const text = speechErrorText(e.error, locale);
      if (text) setMessages((m) => [...m, { role: "assistant", text }]);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      recRef.current = null;
      setListening(false);
    }
  }

  async function send() {
    const question = input.trim();
    const attached = photo;
    if ((!question && !attached) || loading) return;

    setMessages((m) => [...m, { role: "user", text: question || t("📷 صورة", "📷 Photo"), image: attached?.preview }]);
    setInput("");
    setPhoto(null);
    setLoading(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The page the question was asked from, so the assistant can answer a
        // vague "ما هذا؟" about the screen in front of the visitor. This is why
        // the platform needs no help page per screen.
        body: JSON.stringify({
          question,
          path: pathname,
          ...(attached ? { image: { mime: attached.mime, data: attached.data } } : {}),
        }),
        /*
         * A deadline, because the alternative has no end.
         *
         * The answer travels through a model call, and on a weak connection a
         * fetch with no timeout can stay open until the page is reloaded —
         * "يكتب الآن..." forever, the send button disabled, the conversation
         * dead with no error to show for it. Forty-five seconds is longer than
         * any answer has taken and short enough to still be waiting for.
         */
        signal: AbortSignal.timeout(45_000),
      });
      const data = await res.json();
      const userTurns = messages.filter((m) => m.role === "user").length + 1;
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.answer ?? data.error ?? t("حدث خطأ غير متوقع", "Something unexpected went wrong"),
          source: data.answer ? data.source : undefined,
        },
      ]);
      if (userTurns === 2 && !leadResult) setShowLeadForm(true);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: t("انقطع الاتصال قبل أن تصل الإجابة. تحقّق من الشبكة وأعد إرسال سؤالك.", "The connection dropped before the answer arrived. Check your network and send your question again."),
        },
      ]);
      // Hand the question back to the box so a retry is one press rather than
      // retyping it. Only on failure — a delivered question must not reappear.
      setInput(question);
      if (attached) setPhoto(attached);
    } finally {
      setLoading(false);
    }
  }

  /*
   * onSubmit rather than a form action, on purpose.
   *
   * React resets an uncontrolled form once its action resolves — so a failed
   * send used to wipe the name and the phone number along with it, and asking
   * someone to type their number a second time after it already vanished once
   * is how a contact form stops receiving contacts. Handling submit ourselves
   * leaves the fields exactly as written, and a retry is one press.
   */
  async function handleLeadSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (leadSubmitting) return;

    const formData = new FormData(e.currentTarget);
    setLeadSubmitting(true);
    // sendLead never rejects, so the button is always released and the visitor
    // is always told something.
    const result = await sendLead(formData);
    setLeadResult(result);
    setLeadSubmitting(false);
    if (result.ok) setShowLeadForm(false);
  }

  useEffect(() => {
    const field = (el: EventTarget | null) =>
      el instanceof HTMLElement && !el.closest("[data-assistant]") && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    const onIn = (e: FocusEvent) => setTyping(field(e.target));
    const onOut = () => setTyping(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  return (
    /*
     * The panel and the launcher are deliberately separate fixed elements.
     *
     * They used to share one container that carried the drag transform, and a
     * transformed ancestor becomes the containing block for its fixed
     * descendants — so dragging the launcher to the edge dragged the panel with
     * it and pushed the panel off-screen when opened. Keeping them apart means
     * the reader can put the button anywhere while the conversation always
     * opens fully on-screen.
     *
     * And the launcher is not rendered while the panel is open. It used to
     * stay, which meant a reader who had dragged it anywhere but the bottom
     * corner found it sitting on top of the conversation it had just opened —
     * the panel is fixed to the corner and the button is wherever they left it,
     * so no amount of geometry keeps the two apart. The panel header already
     * carries a close button, so nothing is lost; and with the launcher gone
     * the panel can use the same bottom anchor instead of leaving a
     * button-sized gap of page showing underneath itself.
     */
    <>
      {open && (
        <div
          data-assistant
          className="fixed inset-x-4 z-[99] print:hidden flex h-[28rem] max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl sm:right-auto sm:left-4 sm:w-80"
          style={{ bottom: "calc(1.25rem + max(var(--nav-bottom, 0px), env(safe-area-inset-bottom)))" }}
        >
          <div className="flex items-center justify-between border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <span className="font-bold">🌾 {t("مساعد سوداقري", "Sudagri assistant")}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowLeadForm((v) => !v)}
                className="text-xs underline underline-offset-2"
              >
                {t("تواصل معنا", "Contact us")}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-lg leading-none"
                aria-label={t("إغلاق", "Close")}
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 text-sm">
            {messages.length === 0 && !showLeadForm && (
              <p className="text-muted">
                {t(
                  "اسألني عن أي محصول أو ماشية سودانية — تربة، ري، آفات، أصناف. اكتب، أو قُل سؤالك بزرّ الميكروفون، أو صوّر الورقة أو الحيوان بزرّ الكاميرا.",
                  "Ask me about any Sudanese crop or livestock — soil, irrigation, pests, varieties. Type, say your question with the microphone button, or photograph the leaf or the animal with the camera button.",
                )}
              </p>
            )}
            <div className="flex flex-col gap-2">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-xl px-3 py-2 ${
                    m.role === "user"
                      ? "self-end bg-primary text-primary-foreground"
                      : "self-start border border-border bg-background"
                  }`}
                >
                  {m.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.image} alt="" className="mb-1 max-h-40 rounded-lg" />
                  )}
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  {m.role === "assistant" && m.text.length > 20 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!speak(m.text, locale === "en" ? "en-GB" : "ar-SA")) {
                          setMessages((all) => [...all, { role: "assistant", text: t("هذا الهاتف لا يقرأ النصّ بصوت. جرّب متصفّح كروم.", "This phone cannot read text aloud. Try the Chrome browser.") }]);
                        }
                      }}
                      className="mt-1 text-[0.7rem] text-muted underline"
                    >
                      🔊 {t("اسمع الجواب", "Listen")}
                    </button>
                  )}
                  {m.source && SOURCE_LABEL[m.source] && (
                    <p className="mt-1.5 border-t border-border pt-1.5 text-[0.7rem] text-muted">
                      {(locale === "en" ? SOURCE_LABEL_EN : SOURCE_LABEL)[m.source]}
                    </p>
                  )}
                </div>
              ))}
              {loading && (
                <div className="self-start text-xs text-muted">
                  {t("يكتب الآن...", "Typing...")}
                </div>
              )}
            </div>

            {showLeadForm && (
              <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="mb-2 text-sm font-medium">
                  {t("هل تريد أن يتواصل معك فريق سوداقري مباشرة؟", "Would you like the Sudagri team to contact you directly?")}
                </p>
                <form onSubmit={handleLeadSubmit} className="flex flex-col gap-2">
                  <input
                    name="full_name"
                    placeholder={t("الاسم", "Name")}
                    required
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <input
                    name="contact"
                    placeholder={t("رقم الهاتف أو البريد الإلكتروني", "Phone number or email")}
                    required
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <select
                    name="role"
                    defaultValue="investor"
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="investor">{t("مستثمر", "Investor")}</option>
                    <option value="farmer">{t("مزارع", "Farmer")}</option>
                    <option value="other">{t("أخرى", "Other")}</option>
                  </select>
                  <input
                    name="interest"
                    placeholder={t("ما اهتمامك؟ (اختياري — مثلاً: القطن، مشروع الجزيرة)", "What interests you? (optional — e.g. cotton, the Gezira Scheme)")}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={leadSubmitting}
                      className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {leadSubmitting ? t("جارٍ الإرسال...", "Sending...") : t("إرسال", "Send")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLeadForm(false)}
                      className="rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      {t("لاحقاً", "Later")}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {leadResult && (
              <p
                className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                  leadResult.ok
                    ? "border border-primary/30 bg-primary/10 text-primary"
                    : "border border-danger/30 bg-danger/10 text-danger"
                }`}
              >
                {leadResult.message}
              </p>
            )}

            <div ref={endRef} />
          </div>

          {photo && (
            <div className="flex items-center gap-2 border-t border-border px-2 pt-2 text-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.preview} alt="" className="h-10 w-10 rounded object-cover" />
              <span className="flex-1 text-muted">{t("صورة مرفقة — اكتب سؤالك أو أرسلها كما هي", "Photo attached — add a question or send it as it is")}</span>
              <button type="button" onClick={() => setPhoto(null)} aria-label={t("أزل الصورة", "Remove photo")} className="text-lg leading-none">
                ×
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2 border-t border-border p-2"
          >
            {/* صوّر وأسأل: الكاميرا الخلفيّة مباشرةً على الهاتف، أو ملفٌّ على الحاسوب. */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => pickPhoto(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={loading || photoBusy}
              aria-label={t("صوّر النبات أو الحيوان واسأل", "Photograph the plant or animal and ask")}
              title={t("صوّر واسأل", "Photo and ask")}
              className="rounded-lg border border-border px-2 text-lg disabled:opacity-50"
            >
              📷
            </button>
            <button
              type="button"
              onClick={toggleListening}
              disabled={loading}
              aria-pressed={listening}
              aria-label={listening ? t("أوقف الاستماع", "Stop listening") : t("قُل سؤالك بالصوت", "Say your question")}
              title={listening ? t("أوقف", "Stop") : t("قُل سؤالك", "Say your question")}
              className={`rounded-lg border px-2 text-lg disabled:opacity-50 ${listening ? "animate-pulse border-danger bg-danger/10" : "border-border"}`}
            >
              🎤
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? t("أسمعك… تكلّم", "Listening… speak") : photo ? t("سؤالك عن الصورة (اختياري)", "Your question about the photo (optional)") : t("اكتب سؤالك...", "Type your question...")}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {t("إرسال", "Send")}
            </button>
          </form>
        </div>
      )}

      {/* A labelled pill rather than a bare icon — a lone circle reads as
          decoration and visitors were not finding the assistant at all.
          Draggable, because no fixed corner is free on every page. */}
      {!open && !typing && !formPage && (
        <div
          ref={dragRef}
          suppressHydrationWarning
          className="fixed left-4 z-[100] print:hidden"
          style={{
            bottom: "calc(1.25rem + max(var(--nav-bottom, 0px), env(safe-area-inset-bottom)))",
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            touchAction: "none",
          }}
        >
          <button
            onPointerDown={onPointerDown}
            onClick={() => {
              // A drag must not also open the panel.
              if (consumeDrag()) return;
              setOpen((v) => !v);
            }}
            className={`flex touch-none items-center gap-2 rounded-full bg-primary py-3 pe-5 ps-4 text-primary-foreground shadow-xl ring-2 ring-primary/25 transition hover:opacity-90 ${
              dragging ? "scale-105 cursor-grabbing" : "cursor-grab"
            }`}
            aria-label={t("افتح مساعد سوداقري — يمكنك سحب الزر لتحريكه", "Open the Sudagri assistant — you can drag the button to move it")}
            aria-expanded={open}
          >
            <span className="text-2xl leading-none">💬</span>
            <span className="whitespace-nowrap text-sm font-bold">
              {t("اسأل سوداقري", "Ask Sudagri")}
            </span>
          </button>
        </div>
      )}
    </>
  );
}
