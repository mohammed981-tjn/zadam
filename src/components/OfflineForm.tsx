"use client";

import { startTransition, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import { isNetworkError, keepOffline, keptMessage, listPending, offlineNow, replayPending, stampClientKey } from "@/lib/outboxClient";

const RETRY_MS = 30_000;

/**
 * A `<form>` that keeps what was written when the network is down and sends it later (backlog 167).
 *
 * For forms whose server action answers nothing (it revalidates and returns): the cost entry in a
 * season's book. Online it behaves as `<form action={action}>` always did. Offline, or when the
 * request never reaches the server, the text fields are kept on this phone — under the signed-in
 * account, for seven days — and sent by the same action when the network is back.
 *
 * `stamp` names a hidden field to fill with the phone's own day when a form is kept, so a cost
 * typed on Monday and sent on Thursday still says Monday.
 *
 * `clientKey` gives each submission an idempotency key (`client_key`) before its first attempt, kept with it if it has
 * to wait: when the server saved the entry but its answer never arrived, the later send is «already saved», not a
 * second line in the book (the ledger's form; 20261106060000_ledger_client_key.sql).
 */
export default function OfflineForm({
  action,
  outboxKey,
  label,
  stamp,
  clientKey,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<unknown>;
  outboxKey: string;
  label: string;
  stamp?: string;
  clientKey?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const path = usePathname();
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);

  const keep = (formData: FormData) => setNote(keptMessage(keepOffline({ key: outboxKey, path, label, formData, stamp, clientKey }), t));

  const submit = async (formData: FormData) => {
    setNote(null);
    if (clientKey) stampClientKey(formData);
    if (offlineNow()) return keep(formData);
    try {
      await action(formData);
    } catch (e) {
      if (isNetworkError(e)) return keep(formData);
      throw e;
    }
  };

  useEffect(() => {
    const run = () => {
      if (listPending(outboxKey).length === 0) return;
      startTransition(async () => {
        const sent = await replayPending(outboxKey, action, undefined);
        if (sent > 0) setNote({ ok: true, message: tr(locale, "أُرسل ما كنّا حفظناه على هاتفك.", "What we had kept on your phone was sent.") });
      });
    };
    run();
    window.addEventListener("online", run);
    const timer = window.setInterval(run, RETRY_MS);
    return () => {
      window.removeEventListener("online", run);
      window.clearInterval(timer);
    };
  }, [outboxKey, action, locale]);

  return (
    <form action={submit} className={className}>
      {children}
      {note && (
        <p className={`basis-full text-sm ${note.ok ? "text-primary" : "text-danger"}`} role="status">
          {note.message}
        </p>
      )}
    </form>
  );
}
