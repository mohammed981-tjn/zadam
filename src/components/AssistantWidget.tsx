"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { sendLead } from "@/lib/leads";
import { OPEN_ASSISTANT_EVENT } from "@/lib/events";
import { useDraggable } from "@/lib/useDraggable";

type Msg = { role: "user" | "assistant"; text: string; source?: string };

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
  canal: "من ملفّ القناة القوسية في قاعدة سودجري",
  market: "من قاعدة FAOSTAT المحمَّلة في المنصّة",
  climate: "متوسّطات مناخية مقيسة — NASA POWER",
  knowledge: "من قاعدة معرفة سودجري المراجَعة",
  platform: "من حالة المنصة الحالية",
  cache: "معرفة عامة خارج قاعدة سودجري المتحقَّقة",
  model: "معرفة عامة خارج قاعدة سودجري المتحقَّقة",
};

export default function AssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
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

  async function send() {
    const question = input.trim();
    if (!question || loading) return;

    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The page the question was asked from, so the assistant can answer a
        // vague "ما هذا؟" about the screen in front of the visitor. This is why
        // the platform needs no help page per screen.
        body: JSON.stringify({ question, path: pathname }),
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
          text: data.answer ?? data.error ?? "حدث خطأ غير متوقع",
          source: data.answer ? data.source : undefined,
        },
      ]);
      if (userTurns === 2 && !leadResult) setShowLeadForm(true);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "انقطع الاتصال قبل أن تصل الإجابة. تحقّق من الشبكة وأعد إرسال سؤالك.",
        },
      ]);
      // Hand the question back to the box so a retry is one press rather than
      // retyping it. Only on failure — a delivered question must not reappear.
      setInput(question);
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
          className="fixed inset-x-4 z-[99] flex h-[28rem] max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl sm:right-auto sm:left-4 sm:w-80"
          style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center justify-between border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <span className="font-bold">🌾 مساعد سودجري</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowLeadForm((v) => !v)}
                className="text-xs underline underline-offset-2"
              >
                تواصل معنا
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-lg leading-none"
                aria-label="إغلاق"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 text-sm">
            {messages.length === 0 && !showLeadForm && (
              <p className="text-muted">
                اسألني عن أي مشروع معروض على المنصة، أو أي محصول أو ماشية
                سودانية — تربة، ري، آفات، أصناف.
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
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  {m.source && SOURCE_LABEL[m.source] && (
                    <p className="mt-1.5 border-t border-border pt-1.5 text-[0.7rem] text-muted">
                      {SOURCE_LABEL[m.source]}
                    </p>
                  )}
                </div>
              ))}
              {loading && (
                <div className="self-start text-xs text-muted">
                  يكتب الآن...
                </div>
              )}
            </div>

            {showLeadForm && (
              <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="mb-2 text-sm font-medium">
                  هل تريد أن يتواصل معك فريق سودجري مباشرة؟
                </p>
                <form onSubmit={handleLeadSubmit} className="flex flex-col gap-2">
                  <input
                    name="full_name"
                    placeholder="الاسم"
                    required
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <input
                    name="contact"
                    placeholder="رقم الهاتف أو البريد الإلكتروني"
                    required
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <select
                    name="role"
                    defaultValue="investor"
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="investor">مستثمر</option>
                    <option value="farmer">مزارع</option>
                    <option value="other">أخرى</option>
                  </select>
                  <input
                    name="interest"
                    placeholder="ما اهتمامك؟ (اختياري — مثلاً: القطن، مشروع الجزيرة)"
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={leadSubmitting}
                      className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {leadSubmitting ? "جارٍ الإرسال..." : "إرسال"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLeadForm(false)}
                      className="rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      لاحقاً
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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2 border-t border-border p-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="اكتب سؤالك..."
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              إرسال
            </button>
          </form>
        </div>
      )}

      {/* A labelled pill rather than a bare icon — a lone circle reads as
          decoration and visitors were not finding the assistant at all.
          Draggable, because no fixed corner is free on every page. */}
      {!open && (
        <div
          ref={dragRef}
          suppressHydrationWarning
          className="fixed left-4 z-[100]"
          style={{
            bottom: "calc(1.25rem + env(safe-area-inset-bottom))",
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
            aria-label="افتح مساعد سودجري — يمكنك سحب الزر لتحريكه"
            aria-expanded={open}
          >
            <span className="text-2xl leading-none">💬</span>
            <span className="whitespace-nowrap text-sm font-bold">
              اسأل سودجري
            </span>
          </button>
        </div>
      )}
    </>
  );
}
