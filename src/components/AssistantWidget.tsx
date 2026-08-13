"use client";

import { useEffect, useRef, useState } from "react";
import { submitLead } from "@/app/leads/actions";
import { OPEN_ASSISTANT_EVENT } from "@/lib/events";
import { useDraggable } from "@/lib/useDraggable";

type Msg = { role: "user" | "assistant"; text: string };

export default function AssistantWidget() {
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
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      const userTurns = messages.filter((m) => m.role === "user").length + 1;
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.answer ?? data.error ?? "حدث خطأ غير متوقع",
        },
      ]);
      if (userTurns === 2 && !leadResult) setShowLeadForm(true);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "تعذّر الاتصال بالمساعد، حاول مرة أخرى." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleLeadSubmit(formData: FormData) {
    setLeadSubmitting(true);
    const result = await submitLead(formData);
    setLeadResult(result);
    setLeadSubmitting(false);
    if (result.ok) setShowLeadForm(false);
  }

  return (
    // Sits above the mobile browser's bottom chrome, which was hiding the
    // launcher entirely on phones. The z-index is deliberately far above
    // anything else on the page so no later component can bury it.
    <div
      ref={dragRef}
      suppressHydrationWarning
      className="fixed bottom-4 left-4 z-[100]"
      style={{
        bottom: "calc(1.25rem + env(safe-area-inset-bottom))",
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        touchAction: "none",
      }}
    >
      {open && (
        <div className="mb-3 flex h-[28rem] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
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
                  {m.text}
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
                <form action={handleLeadSubmit} className="flex flex-col gap-2">
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
        {!open && (
          <span className="whitespace-nowrap text-sm font-bold">
            اسأل سودجري
          </span>
        )}
      </button>
    </div>
  );
}
