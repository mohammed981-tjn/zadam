import Link from "next/link";
import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import AssistantWidget from "@/components/AssistantWidget";

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "900"],
});

export const metadata: Metadata = {
  title: "سودجري | معرفة زراعية واستثمار ذكي في السودان",
  description:
    "منصة تخدم كل مزارع ومستثمر سوداني: قاعدة معرفة زراعية موثّقة عن المحاصيل والثروة الحيوانية، ومشاريع استثمار زراعي موثّقة قانونياً بمتابعة ميدانية دورية.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${tajawal.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        {/*
          The feedback invitation sits in the layout footer, so it is on every
          page and every tab without a third floating button.

          A floating launcher was the obvious alternative and it is the wrong
          one here: the assistant already owns a draggable fixed launcher at
          left-4, and it already overlaps its own panel when open. Adding
          another permanently-visible circle to the same corner would make the
          two compete on a phone, which is where nearly all of this traffic is.
          A footer band is on every screen, needs no z-index argument with
          anything, and is where a reader looks once they have finished reading.
        */}
        <footer className="mt-10 border-t border-border">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-8 text-center">
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
