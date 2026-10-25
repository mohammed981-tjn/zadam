"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import type { OutboxItem } from "@/lib/outbox";
import { dropItem, listPending, setOutboxOwner, subscribeOutbox } from "@/lib/outboxClient";
import { dropPhoto, photosSnapshot, refreshPhotos, subscribePhotos, type PhotoSummary } from "@/lib/photoOutboxClient";

/**
 * Tells the outbox who is signed in, and shows what is waiting to be sent (backlog 167), photos included (185).
 *
 * The server renders the account's id into the page; offline there is no other way to know whose
 * session the phone holds, and an item must only ever be sent by the person who wrote it. The
 * banner shows only that account's items, each with the page whose form will send it.
 */
export default function OutboxProvider({ userId }: { userId: string | null }) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  useEffect(() => {
    setOutboxOwner(userId);
    void refreshPhotos().catch(() => undefined);
    return () => setOutboxOwner(null);
  }, [userId]);

  const snapshot = useSyncExternalStore(subscribeOutbox, () => JSON.stringify(listPending()), () => "[]");
  // The photo box is read after the owner is known; its change signal also fires when the owner is set.
  const photoSnapshot = useSyncExternalStore(
    (cb) => {
      const a = subscribePhotos(cb);
      const b = subscribeOutbox(cb);
      return () => {
        a();
        b();
      };
    },
    () => photosSnapshot(),
    () => "[]",
  );
  const items = JSON.parse(snapshot) as OutboxItem[];
  const photos = JSON.parse(photoSnapshot) as PhotoSummary[];
  const total = items.length + photos.length;
  if (total === 0) return null;

  return (
    <aside className="border-b border-border bg-card px-4 py-2 text-sm print:hidden" role="status">
      <div className="mx-auto max-w-3xl">
        <p className="font-bold">
          {t(`عندك ${total} محفوظ على هاتفك لم يُرسل بعد`, `You have ${total} kept on your phone, not yet sent`)}
        </p>
        <ul className="mt-1 flex flex-col gap-1">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2">
              <span dir="auto">{i.label}</span>
              <Link href={i.path} className="text-primary underline">
                {t("افتح الصفحة ليُرسَل", "Open the page to send it")}
              </Link>
              <button type="button" onClick={() => dropItem(i.id)} className="text-xs text-muted underline">
                {t("لا أريده", "Discard")}
              </button>
            </li>
          ))}
          {photos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 [overflow-wrap:anywhere]">
              <span dir="auto">
                {p.label} — {p.caption}
              </span>
              {p.status === "refused" ? (
                <span className="text-xs text-danger">
                  {t("رُفض حين أُرسل", "Refused when sent")}
                  {p.message ? <>: {p.message}</> : null}
                </span>
              ) : (
                <Link href={p.path} className="text-primary underline">
                  {t("افتح الصفحة ليُرفع", "Open the page to upload it")}
                </Link>
              )}
              <button type="button" onClick={() => void dropPhoto(p.id)} className="text-xs text-muted underline">
                {t("لا أريده", "Discard")}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
