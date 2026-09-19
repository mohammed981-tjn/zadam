import logo from "../../public/sudagri-logo.webp";

/**
 * الشعارُ مستورَداً لا مساراً — ولماذا يهمّ الفرق.
 *
 * Every surface used to write `src="/sudagri-logo.png"`. That works, but it
 * hands Next.js a string, and a string is all it can know: no dimensions, and
 * nothing to show while the picture is still on the wire. On a Sudanese mobile
 * connection "still on the wire" is most of the time a visitor spends with the
 * splash screen, and what they saw there was an empty cream rectangle — the
 * owner's report was precisely that he never saw the logo, only a wait.
 *
 * A static import is read at build time, so Next.js derives from the file
 * itself:
 *
 *   • `width` and `height`, which reserve the box and stop the layout jumping;
 *   • `blurDataURL`, a few hundred bytes of the real image inlined into the
 *     markup, which paints in the first frame with no request at all.
 *
 * The blur is the part that matters here. It is generated from this exact file
 * on every build, so it can never drift from the artwork the way a pasted
 * data URL would — and it is why the splash now opens on the badge's own green
 * and gold instead of on nothing.
 *
 * WHY THE FILE STAYS IN `public/` ANYWAY
 *
 * Importing it does not remove it from `/sudagri-logo.webp`, and that URL earns
 * its keep: it is the link the owner can paste into WhatsApp or hand to anyone
 * who asks for the logo, without needing a build to produce it.
 *
 * WHY WebP AND NOT PNG — AND WHAT IT COST TO LEARN
 *
 * The owner reported twice that the yellow sorghum was missing from his logo.
 * The second time he was still right, and the cause was not the crop: the file
 * had been quantised to a 128-colour palette, and that is what a palette does
 * to an illustration — it spends its colours on the large flat areas and
 * starves the small saturated ones. The brightest grain went from
 * `rgb(248,157,0)` to `rgb(148,166,7)`: gold to olive. Measured against the
 * untouched artwork the palette version was off by 14 on average and by 157 at
 * worst, which is not compression, it is repainting.
 *
 * So the master is rebuilt from the owner's own upload with no palette step at
 * all. Lossless would be 702 KB; WebP at quality 94 is 202 KB and differs from
 * lossless by 2.7 on average and 32 at worst — below what an eye resolves, and
 * with no banding, which is what the palette's outliers actually were.
 *
 * The rule this leaves behind: **never quantise this artwork.** `sharp`'s
 * `png({ effort: 10 })` silently turns the palette back on — it produced a
 * tempting 199 KB and a maximum error of 120. Check the error, not the size.
 */
export const SUDAGRI_LOGO = logo;
