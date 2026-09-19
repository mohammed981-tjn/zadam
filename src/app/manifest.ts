import type { MetadataRoute } from "next";

/**
 * بيانُ التطبيق — وهو موضعُ شاشة البداية الحقيقيّ.
 *
 * WHY A MANIFEST IS THE ANSWER TO "I WANT A SPLASH SCREEN"
 *
 * A splash screen belongs to an installed application, and this is a website.
 * A web page that covers itself for a second before showing anything makes
 * every visitor wait for a picture they have already seen, on connections where
 * the wait is not a second — and the visitor who came to check a water figure
 * pays it every time.
 *
 * An installed app is the opposite case: the operating system is going to show
 * *something* while the page boots, and without a manifest it shows a white
 * rectangle. Naming the icon and the background colour here is what turns that
 * blank into the platform's own logo on its own cream, drawn by the OS at full
 * screen with nothing loading and nothing to wait for.
 *
 * So: a real splash where a splash costs nothing, and — in `SplashOnce` — a
 * brief one on the web that a visitor sees exactly once and never blocks on.
 *
 * `display: "standalone"` is what makes the platform open without browser
 * chrome once added to the home screen, which is also what makes the OS splash
 * appear at all.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "سودجري — منصّة سودانية للزراعة والتجارة",
    short_name: "سودجري",
    description:
      "معرفة زراعية وبيانات مفتوحة للسودان: الغلّة والمناخ والتربة والاحتياج المائي، وتوثيق المواسم والأراضي.",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    display: "standalone",
    // لونُ خلفيّة الشاشة الافتتاحيّة — هو `--background` نفسُه، فلا ومضةَ بياضٍ
    // بين الشاشة الافتتاحيّة وأوّل عرضٍ للصفحة.
    background_color: "#f7f5ef",
    theme_color: "#1f7a3d",
    /*
     * مقاسان بصيغتين، والنظامُ يختار ما يفهم.
     *
     * The 512 is WebP because the artwork is a detailed illustration and a
     * lossless PNG of it is 417 KB — four times the WebP for a difference no
     * eye resolves. Quantising the PNG instead is the one thing not on the
     * table: that is what turned the sorghum from gold to olive, twice.
     *
     * The 192 stays PNG deliberately. A manifest icon list is a menu, not a
     * sequence — a launcher that cannot read WebP simply takes this one, and
     * every system can read a PNG. So the cheap format is offered and the
     * universal one is guaranteed.
     */
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.webp", sizes: "512x512", type: "image/webp" },
      // `maskable` يتيح للنظام قصَّ الأيقونة بشكله (دائرة · مربّع بحواف) بلا
      // أن يقصّ من الرسم ما يهمّ.
      {
        src: "/icon-512.webp",
        sizes: "512x512",
        type: "image/webp",
        purpose: "maskable",
      },
    ],
  };
}
