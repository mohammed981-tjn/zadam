import logo from "../../public/sudagri-logo.png";

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
 * Importing it does not remove it from `/sudagri-logo.png`, and that URL earns
 * its keep: it is the link the owner can paste into WhatsApp or hand to anyone
 * who asks for the logo, without needing a build to produce it.
 */
export const SUDAGRI_LOGO = logo;
