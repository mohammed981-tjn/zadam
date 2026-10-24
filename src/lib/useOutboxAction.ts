"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import { isNetworkError, keepOffline, keptMessage, listPending, offlineNow, replayPending } from "@/lib/outboxClient";

/** How often a mounted form looks for a network that came back without a browser event. */
const RETRY_MS = 30_000;

/**
 * `useActionState` for a form whose server action answers `{ ok, message }`, that keeps what was
 * written when the network is down and sends it later (backlog 167).
 *
 * Offline, or a request that never reaches the server, does not throw into the page: the fields are
 * kept on the phone and the person is told so. They are sent by the same action when the browser
 * says the network is back, on a slow retry while this form is open, and when the person opens the
 * form again. `kept` says the last answer was «kept on the phone», not an error; `note` carries what
 * the server said about a kept form once it was sent.
 */
export function useOutboxAction<S extends { ok: boolean; message: string }>(
  action: (prev: S | null, formData: FormData) => Promise<S>,
  opts: { key: string; label: string },
) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const path = usePathname();
  const [note, setNote] = useState<string | null>(null);
  const [kept, setKept] = useState(false);
  const { key, label } = opts;

  // Never `ok: true`: several forms read that as «saved» and show their success screen.
  const keep = (formData: FormData) => {
    const result = keepOffline({ key, path, label, formData });
    setKept(result === "kept" || result === "duplicate");
    return { ...keptMessage(result, t), ok: false } as S;
  };

  const wrapped = async (prev: S | null, formData: FormData): Promise<S> => {
    setKept(false);
    if (offlineNow()) return keep(formData);
    try {
      return await action(prev, formData);
    } catch (e) {
      if (isNetworkError(e)) return keep(formData);
      throw e;
    }
  };

  const [state, formAction, pending] = useActionState<S | null, FormData>(wrapped, null);

  useEffect(() => {
    const run = () => {
      if (listPending(key).length === 0) return;
      startTransition(async () => {
        await replayPending(
          key,
          (fd) => action(null, fd),
          (result) => {
            const message = (result as Partial<S> | undefined)?.message;
            if (message) setNote(message);
          },
        );
      });
    };
    run();
    window.addEventListener("online", run);
    const timer = window.setInterval(run, RETRY_MS);
    return () => {
      window.removeEventListener("online", run);
      window.clearInterval(timer);
    };
  }, [key, action]);

  return { state, formAction, pending, note, kept };
}
