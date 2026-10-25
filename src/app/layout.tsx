import Link from "next/link";
import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import SplashOnce from "@/components/SplashOnce";
import AssistantWidget from "@/components/AssistantWidget";
import ServiceWorker from "@/components/ServiceWorker";
import { SITE_URL } from "@/lib/site";
import { getLocale } from "@/lib/locale";
import { dirOf, tr } from "@/lib/i18n";
import LocaleProvider from "@/components/LocaleProvider";
import PageLang from "@/components/PageLang";

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "900"],
});


const COPY = {
  ar: {
    title: "سوداقري | معرفة زراعية واستثمار ذكي في السودان",
    description:
      "منصة تخدم كل مزارع ومستثمر سوداني: قاعدة معرفة زراعية موثّقة عن المحاصيل والثروة الحيوانية، ومشاريع استثمار زراعي موثّقة قانونياً بمتابعة ميدانية دورية.",
    siteName: "سوداقري",
    locale: "ar_SD",
  },
  en: {
    title: "Sudagri | Agricultural knowledge and smart investment in Sudan",
    description:
      "A platform for every Sudanese farmer and investor: a documented knowledge base on crops and livestock, and legally documented agricultural investment projects with regular field follow-up.",
    siteName: "Sudagri",
    locale: "en_US",
  },
} as const;

/*
 * الشعارُ يسافر مع الرابط، لا يقف على الموقع.
 *
 * Nearly all of this platform's traffic arrives on a phone, and nearly all of
 * it will arrive as a link pasted into WhatsApp. Without an `openGraph` block a
 * pasted link renders as a bare grey card with a domain nobody recognises —
 * which is where the logo matters most and where the site itself is not yet
 * visible.
 *
 * `metadataBase` is what makes the relative image path absolute. Without it
 * Next emits a relative `og:image`, and every scraper that reads it — WhatsApp,
 * Facebook, Twitter — silently shows no image at all.
 *
 * `icons` is deliberately not listed: `src/app/icon.png`, `apple-icon.png` and
 * `favicon.ico` are picked up by file convention, and naming them here too
 * would be a second copy of the truth that can drift from the files.
 */
export async function generateMetadata(): Promise<Metadata> {
  const c = COPY[await getLocale()];
  return {
    metadataBase: new URL(SITE_URL),
    title: c.title,
    description: c.description,
    openGraph: {
      type: "website",
      siteName: c.siteName,
      locale: c.locale,
      url: SITE_URL,
      title: c.title,
      description: c.description,
    },
    twitter: {
      card: "summary_large_image",
      title: c.title,
      description: c.description,
    },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      className={`${tajawal.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col lg:ps-64">
        <LocaleProvider locale={locale}>
        {/* شاشةُ البداية فوق الصفحة لا مكانَها: الصفحةُ تُعرض من أوّل إطار،
            وهذه طبقةٌ تنزاح عنها. */}
        <SplashOnce />
        <Navbar />
        <main className="flex-1">
          <PageLang>{children}</PageLang>
        </main>
        {/*
          The feedback invitation sits in the layout footer, so it is on every
          page and every tab without a third floating button.

          A floating launcher was the obvious alternative and it is the wrong
          one here: the assistant already owns a draggable fixed launcher at
          left-4. Adding another permanently-visible circle to the same corner
          would make the two compete on a phone, which is where nearly all of
          this traffic is. A footer band is on every screen, needs no z-index
          argument with anything, and is where a reader looks once they have
          finished reading.

          The extra bottom padding is for that launcher: it rests over the
          bottom-left corner, and without room here it covers the last line of
          the footer on a narrow screen.
        */}
        {/* شريطُ التوب السوداني (البند ١٠٦) فوق التذييل في كلّ صفحة — بدل الخطّ الرفيع. */}
        <div className="toub-rule mt-10 print:hidden" aria-hidden />
        <footer className="print:hidden">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 pb-24 pt-8 text-center">
            <p className="text-base font-semibold">
              {t("رأيك يبني هذه المنصة", "Your view builds this platform")}
            </p>
            <p className="max-w-xl text-sm leading-relaxed text-muted">
              {t(
                "المنصّة تُبنى الآن، وأنت ترى ما لا نراه. اكتب ما أربكك أو ما تريد إضافته — بلا حساب، وتردّ عليك الإدارة.",
                "The platform is being built now, and you see what we miss. Tell us what confused you or what you would add — no account needed, and the team replies.",
              )}
            </p>
            <Link
              href="/feedback"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {t("أرسل ملاحظة أو اقتراحاً", "Send a note or a suggestion")}
            </Link>
            <p className="pt-2 text-sm text-muted">
              {t(
                "سوداقري — منصة استثمار زراعي رقمي في السودان · MVP تجريبي",
                "Sudagri — a digital agricultural investment platform in Sudan · pilot MVP",
              )}
            </p>
            <Link href="/privacy" className="text-xs text-muted underline">
              {t("الخصوصية وحذف الحساب", "Privacy and account deletion")}
            </Link>
          </div>
        </footer>
        <AssistantWidget />
        <ServiceWorker />
        </LocaleProvider>
      </body>
    </html>
  );
}
