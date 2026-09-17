/**
 * السنبلةُ الصفراء — التي حُذفت، وعادت مرسومةً لا رمزاً تعبيريّاً.
 *
 * WHAT HAPPENED HERE, BECAUSE IT COST THE OWNER THREE ROUNDS
 *
 * The header used to read `🌾 سودجري`. Putting the platform's logo there
 * replaced that line, and with it the emoji — which the owner asked for back
 * three times before I looked in the right place. Twice I "fixed" the sorghum
 * *inside the logo artwork*, which was never what he meant, and twice I told
 * him it was restored. It was not. The thing he lost was here.
 *
 * WHY IT IS DRAWN AND NOT THE EMOJI ITSELF
 *
 * `Icon.tsx` explains why the emoji went: a device font draws it, so it is a
 * different picture on every phone — flat grey on an old Android, a hollow
 * rectangle where the font predates the codepoint — and that hardware is what
 * these visitors actually hold. Restoring the literal `🌾` would restore that
 * lottery along with the colour.
 *
 * So this is the same sorghum, drawn: gold grain, green leaf, identical on
 * every device, no network request, and no character that a font may decline
 * to render.
 *
 * WHY IT IS NOT IN `Icon.tsx`
 *
 * That set has one rule — `currentColor` on a stroke — which is what lets any
 * of its icons sit in any colour of text and invert with the theme. This one
 * is deliberately two fixed colours, because the colour *is* the request. It
 * would have to break that rule to live there, so it lives here instead.
 */
export default function SorghumMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      // زخرفيّةٌ خالصة: الاسمُ مكتوبٌ نصّاً بجانبها، فإعلانُها يكرّره.
      aria-hidden="true"
      focusable="false"
    >
      {/* الساقُ والورقتان */}
      <path
        d="M11.2 22c0-4.2.5-7.6 1.6-10.4 1-2.6 2.4-4.6 4.2-6.1"
        fill="none"
        stroke="#3f8f4a"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M11.4 17.6c-1.5.2-2.8-.3-3.9-1.4-1-1.1-1.6-2.5-1.7-4.2 1.7.2 3.1.8 4.1 1.9 1 1.1 1.5 2.3 1.5 3.7Z"
        fill="#4da155"
      />
      <path
        d="M12.6 13.4c-1.4-.5-2.4-1.4-3.1-2.7-.7-1.3-.9-2.8-.6-4.4 1.5.7 2.6 1.7 3.2 3 .6 1.3.8 2.7.5 4.1Z"
        fill="#3f8f4a"
      />

      {/* الحبُّ — زوجانِ متعاقبان على محور السنبلة */}
      <g fill="#e9a020">
        <ellipse cx="16.9" cy="4.6" rx="1.05" ry="1.5" transform="rotate(32 16.9 4.6)" />
        <ellipse cx="18.4" cy="6.3" rx="1.05" ry="1.5" transform="rotate(62 18.4 6.3)" />
        <ellipse cx="15.5" cy="6.4" rx="1.05" ry="1.5" transform="rotate(32 15.5 6.4)" />
        <ellipse cx="17.2" cy="8.1" rx="1.05" ry="1.5" transform="rotate(62 17.2 8.1)" />
        <ellipse cx="14.3" cy="8.4" rx="1.05" ry="1.5" transform="rotate(32 14.3 8.4)" />
        <ellipse cx="16.1" cy="10" rx="1.05" ry="1.5" transform="rotate(62 16.1 10)" />
        <ellipse cx="13.4" cy="10.5" rx="1.05" ry="1.5" transform="rotate(32 13.4 10.5)" />
        <ellipse cx="15.2" cy="12" rx="1.05" ry="1.5" transform="rotate(62 15.2 12)" />
      </g>
    </svg>
  );
}
