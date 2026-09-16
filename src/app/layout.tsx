import Link from "next/link";
import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import SplashOnce from "@/components/SplashOnce";
import AssistantWidget from "@/components/AssistantWidget";

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "900"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zadam-khaki.vercel.app";

const TITLE = "سودجري | معرفة زراعية واستثمار ذكي في السودان";
const DESCRIPTION =
  "منصة تخدم كل مزارع ومستثمر سوداني: قاعدة معرفة زراعية موثّقة عن المحاصيل والثروة الحيوانية، ومشاريع استثمار زراعي موثّقة قانونياً بمتابعة ميدانية دورية.";

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
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "سودجري",
    locale: "ar_SD",
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${tajawal.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* شاشةُ البداية فوق الصفحة لا مكانَها: الصفحةُ تُعرض من أوّل إطار،
            وهذه طبقةٌ تنزاح عنها. */}
        <SplashOnce />
        <Navbar />
        <main className="flex-1">{children}</main>
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
        <footer className="mt-10 border-t border-border">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 pb-24 pt-8 text-center">
            <p className="text-base font-semibold">
              رأيك يبني هذه المنصة
            </p>
            <p className="max-w-xl text-sm leading-relaxed text-muted">
              المنصّة تُبنى الآن، وأنت ترى ما لا نراه. اكتب ما أربكك أو ما تريد
              إضافته — بلا حساب، وتردّ عليك الإدارة.
            </p>
            <Link
              href="/feedback"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              أرسل ملاحظة أو اقتراحاً
            </Link>
            <p className="pt-2 text-sm text-muted">
              سودجري — منصة استثمار زراعي رقمي في السودان · MVP تجريبي
            </p>
          </div>
        </footer>
        <AssistantWidget />
      </body>
    </html>
  );
}
