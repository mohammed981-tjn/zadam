/**
 * الأيقونات — رسمٌ متجهي لا رموز تعبيرية.
 *
 * The site used emoji as its icon set: 🌾 💰 ⛏️ 🌱. Three problems with that,
 * and the first is the one that matters here.
 *
 * An emoji is drawn by the *device's* font, so the same page is a different
 * page on every phone — flat and grey on an old Android, glossy on an iPhone,
 * and a hollow rectangle where the system font predates the codepoint. On the
 * hardware most of these visitors are using, that is not a hypothetical.
 *
 * It also cannot take the theme: an emoji stays its own colour in dark mode
 * while everything around it inverts. And it carries a tone — a wheat sheaf is
 * cheerful — that works against a platform whose argument is that its numbers
 * hold up.
 *
 * These are inline SVG on `currentColor`: identical everywhere, themed by the
 * text colour they inherit, and no network request. Stroke-drawn at 1.75 so
 * they sit with Tajawal rather than shouting over it.
 */

export type IconName =
  | "wheat"
  | "pickaxe"
  | "droplet"
  | "chart"
  | "book"
  | "shield"
  | "spark"
  | "news"
  | "cloud"
  | "compass"
  | "people"
  | "message"
  | "home"
  | "wrench"
  | "user"
  | "calculator";

const PATHS: Record<IconName, React.ReactNode> = {
  // A pocket calculator: «احسب» in the bar along the bottom (the owner, 23 October).
  calculator: (
    <>
      <rect x="5" y="2.5" width="14" height="19" rx="2" />
      <path d="M8 6.5h8v3H8z" />
      <path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01" />
    </>
  ),
  // A stalk with grain — agriculture, without the emoji's cartoon warmth.
  wheat: (
    <>
      <path d="M12 21V9" />
      <path d="M12 13c0-2.2 1.8-4 4-4 0 2.2-1.8 4-4 4Z" />
      <path d="M12 13c0-2.2-1.8-4-4-4 0 2.2 1.8 4 4 4Z" />
      <path d="M12 8c0-2.2 1.8-4 4-4 0 2.2-1.8 4-4 4Z" />
      <path d="M12 8c0-2.2-1.8-4-4-4 0 2.2 1.8 4 4 4Z" />
    </>
  ),
  pickaxe: (
    <>
      <path d="M14 10 4 20" />
      <path d="M3 21l2-2" />
      <path d="M14.5 3.5C11 4 8.5 6 7.5 9.5c3.5-1 6-3 7-6Z" />
      <path d="M9.5 8.5C10 5 12 2.5 15.5 1.5c-1 3.5-3 6-6 7Z" transform="translate(4 6)" />
    </>
  ),
  droplet: <path d="M12 3s6 6.2 6 10a6 6 0 0 1-12 0c0-3.8 6-10 6-10Z" />,
  chart: (
    <>
      <path d="M3 21h18" />
      <path d="M6 21V11" />
      <path d="M11 21V6" />
      <path d="M16 21v-7" />
      <path d="M21 21V9" />
    </>
  ),
  book: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" />
      <path d="M4 19a2 2 0 0 1 2-2h13" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="m5.6 5.6 2.8 2.8" />
      <path d="m15.6 15.6 2.8 2.8" />
      <path d="m18.4 5.6-2.8 2.8" />
      <path d="m8.4 15.6-2.8 2.8" />
    </>
  ),
  // A folded page with lines — the news.
  news: (
    <>
      <path d="M5 4h11v16H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Z" />
      <path d="M16 8h3v10a2 2 0 0 1-2 2" />
      <path d="M8 8h5" />
      <path d="M8 12h5" />
      <path d="M8 16h3" />
    </>
  ),
  // A cloud with rain under it.
  cloud: (
    <>
      <path d="M7 15a4 4 0 0 1-.5-8A5 5 0 0 1 16 6a3.5 3.5 0 0 1 1 7" />
      <path d="M8 18l-1 2" />
      <path d="M12 18l-1 2" />
      <path d="M16 18l-1 2" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.5" />
      <path d="M18 14a5 5 0 0 1 3 5" />
    </>
  ),
  message: <path d="M4 5h16v11H9l-5 4V5Z" />,
  // The menu's section marks (backlog 121): the front page, the services, the account.
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v10h13V10" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.3 5.3L3.5 17.5a1.4 1.4 0 0 0 2 2l5.9-5.9a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.1-.4-.4-2.1 2.4-2.4Z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
};

export default function Icon({
  name,
  className = "size-6",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      // Decorative in every place it is used: each one sits beside a heading
      // that already says the same thing, and announcing it twice is worse
      // than announcing it once.
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
