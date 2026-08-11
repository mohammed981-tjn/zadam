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
        <footer className="border-t border-border py-6 text-center text-sm text-muted">
          سودجري — منصة استثمار زراعي رقمي في السودان · MVP تجريبي
        </footer>
        <AssistantWidget />
      </body>
    </html>
  );
}
