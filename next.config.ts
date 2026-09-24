import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * عاملُ الخدمة لا يُخزَّن أبداً في المتصفح ولا في CDN: نسخةٌ قديمةٌ منه تبقى
   * تخدم صفحاتٍ قديمة حتى بعد النشر. وهذه ترويسات دليل Next 16 للـPWA نفسها.
   */
  async headers() {
    return [
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
