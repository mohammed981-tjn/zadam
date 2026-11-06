"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import type { OutboxItem } from "@/lib/outbox";
import { listPending, subscribeOutbox } from "@/lib/outboxClient";
import { photosSnapshot, subscribePhotos, type PhotoSummary } from "@/lib/photoOutboxClient";

/**
 * «محفوظٌ على هاتفك لم يُرسل» on the role home (backlog 206): the entries and photos kept with no network (backlogs
 * 167 and 185) live on the phone, not in the database, so the server cannot count them. This card reads the same box
 * OutboxProvider reads, for the account it was told is signed in, and shows nothing when the box is empty.
 */
export default function RoleHomeOffline() {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const entries = useSyncExternalStore(subscribeOutbox, () => JSON.stringify(listPending()), () => "[]");
  const photos = useSyncExternalStore(
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
  const items = JSON.parse(entries) as OutboxItem[];
  const pics = (JSON.parse(photos) as PhotoSummary[]).filter((p) => p.status !== "refused");
  const total = items.length + pics.length;
  if (total === 0) return null;
  const href = items[0]?.path ?? pics[0]?.path ?? "/seasons/offline";

  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4 shadow-card transition hover:border-primary"
    >
      <span className="figure flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">
        {total.toLocaleString(locale === "en" ? "en-US" : "ar-EG")}
      </span>
      <span className="min-w-0">
        <span className="block font-bold">{t("محفوظٌ على هاتفك لم يُرسل بعد", "Kept on your phone, not yet sent")}</span>
        <span className="mt-0.5 block text-sm leading-relaxed text-muted">
          {t("افتح صفحته وهو متّصل ليُرسل وحده", "Open its page while online and it is sent by itself")}
        </span>
      </span>
    </Link>
  );
}
