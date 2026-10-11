import { SITE_URL } from "@/lib/site";
import type { Locale } from "@/lib/i18n";

/**
 * «أرسلها على واتساب» — رابطٌ عاديّ، لا زرٌّ بشيفرة.
 *
 * WHY WHATSAPP AND ONLY WHATSAPP
 *
 * A row of five share buttons is a row nobody reads. In Sudan one channel
 * carries the conversation — the farmer who needs the water calculator hears
 * about it in a WhatsApp group, not on a feed — so there is one button, for
 * that channel, and it says where it sends you.
 *
 * WHY `wa.me/?text=` AND NOT THE WEB SHARE API
 *
 * `navigator.share` needs client JavaScript, differs by browser, and on a
 * desktop often does nothing at all. `wa.me` is a plain link: it opens the app
 * on a phone and WhatsApp Web on a computer, works with scripts disabled, and
 * costs this page no bundle. The message carries the absolute URL, because a
 * relative one pasted into a chat is a dead string.
 */
export default function ShareWhatsApp({
  path,
  text,
  className = "",
  locale = "ar",
}: {
  /** مسارُ الصفحة داخل المنصّة، يبدأ بـ`/`. */
  path: string;
  /** سطرٌ واحدٌ يسبق الرابط في الرسالة — ما يقوله المُرسِل لصاحبه. */
  text: string;
  className?: string;
  locale?: Locale;
}) {
  const href = `https://wa.me/?text=${encodeURIComponent(`${text}\n${SITE_URL}${path}`)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex w-fit items-center gap-2 rounded-full border border-[#25D366]/50 bg-[#25D366]/10 px-4 py-2 text-sm font-bold text-[#128C7E] transition hover:bg-[#25D366]/20 dark:text-[#25D366] ${className}`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-current">
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" />
      </svg>
      {locale === "en" ? "Send it on WhatsApp" : "أرسلها على واتساب"}
    </a>
  );
}
