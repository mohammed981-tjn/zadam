import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * ملفّات الفاو (البند ١٩٧) تُقرأ من القرص بالمزامنة اليومية وبزرّ «افحص الآن»، وقراءتها بمسارٍ يُبنى وقت التشغيل
   * لا يراها تتبّع الملفّات، فتُذكر هنا صراحةً. وتفحص verify-faostat-sync.ts أنّ كلّ شريحةٍ تقرؤها المزامنة مذكورة.
   */
  outputFileTracingIncludes: {
    "/api/health": ["./data/faostat-*.tsv"],
    "/admin/faostat": ["./data/faostat-*.tsv"],
  },
  // The framework's name and version are not for visitors (SEC-11).
  poweredByHeader: false,
  /*
   * عاملُ الخدمة لا يُخزَّن أبداً في المتصفح ولا في CDN: نسخةٌ قديمةٌ منه تبقى
   * تخدم صفحاتٍ قديمة حتى بعد النشر. وهذه ترويسات دليل Next 16 للـPWA نفسها.
   */
  async headers() {
    return [
      /*
       * الترويسات الأمنيّة على كلّ صفحة (SEC-11 وAUTH-22، البند ١٦٣). لا تُحمَّل صفحاتُ المنصّة داخل
       * إطارٍ في موقعٍ آخر (فلا يُخدَع من يدخل أو يعتمد)، ولا يُخمِّن المتصفحُ نوعَ الملف، ولا يُرسَل
       * العنوانُ الكامل إلى المواقع الأخرى، وصلاحيّاتُ الجهاز تُحصَر في المنصّة نفسها: الموقع للأرض
       * والخريطة، والميكروفون لسؤال المساعد بصوتك، والكاميرا لتصوير الإثبات.
       *
       * سياسة المحتوى الكاملة بالـnonce مؤجَّلة عمداً: الخريطة تحمّل عمّالاً من blob: وأنماطاً
       * وبلاطاً من مضيفين خارجيّين، وأيّ خطأٍ فيها يُعطّل الخريطة كلّها. هنا ما لا يخاطر بشيء.
       */
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), interest-cohort=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
