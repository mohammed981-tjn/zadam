import { matchesPath, activeHref, groupForPath, type NavGroup } from "../src/lib/nav";

let fail = 0;
function ok(cond: boolean, label: string) {
  if (!cond) fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
}
function eq<T>(got: T, want: T, label: string) {
  ok(got === want, `${label} — got ${JSON.stringify(got)}`);
}

// The live menu, near enough. Kept in this file rather than imported because
// Navbar is a server component that reads the session.
const GROUPS: NavGroup[] = [
  {
    title: "الرئيسية",
    items: [
      { href: "/", label: "الصفحة الرئيسية" },
      { href: "/guide", label: "دليل الاستخدام" },
      { href: "/tools/water", label: "حاسبة الاحتياج المائي" },
    ],
  },
  {
    title: "الخدمات التعاقدية",
    items: [
      { href: "/services", label: "كتالوج الخدمات" },
      { href: "/services/register", label: "سجّل جهتك" },
      { href: "/contracts", label: "عقودي" },
      { href: "/services/mine", label: "جهتي كمقدّم خدمة" },
    ],
  },
  {
    title: "مزرعتي",
    items: [
      { href: "/lands", label: "أراضيّ" },
      { href: "/seasons", label: "مواسمي" },
      { href: "/herds", label: "دورات الإنتاج الحيواني" },
      { href: "/opportunities/new", label: "ارفع فرصة" },
    ],
  },
  {
    title: "استثماري",
    items: [
      { href: "/dashboard", label: "محفظتي" },
      { href: "/plan", label: "خطط استثمارك" },
    ],
  },
  {
    title: "مشاريع ودراسات",
    items: [{ href: "/arc-canal", label: "القناة القوسية" }],
  },
  {
    title: "التعدين",
    items: [
      { href: "/mining", label: "قسم التعدين" },
      { href: "/mining/registry", label: "سجلّ إثبات المنشأ" },
    ],
  },
  {
    title: "الإدارة",
    items: [
      { href: "/admin", label: "لوحة المشاريع" },
      { href: "/admin/review", label: "مراجعة الفرص" },
      { href: "/admin/providers", label: "توثيق مقدّمي الخدمة" },
    ],
  },
];

console.log("=".repeat(70));
console.log("A) Home must not swallow every path");
console.log("=".repeat(70));
ok(matchesPath("/", "/"), "'/' matches the root");
ok(!matchesPath("/", "/seasons"), "'/' does not match a sub-page");
eq(activeHref(GROUPS, "/"), "/", "root highlights the home entry");

console.log("\n" + "=".repeat(70));
console.log("B) The bug this file exists for: one entry active, not two");
console.log("=".repeat(70));
// /services/mine starts with /services, and the old per-entry rule lit both.
eq(
  activeHref(GROUPS, "/services/mine"),
  "/services/mine",
  "on /services/mine the longest match wins",
);
ok(
  GROUPS[1].items.filter((i) => i.href === activeHref(GROUPS, "/services/mine"))
    .length === 1,
  "exactly one entry in the section is highlighted",
);
eq(
  activeHref(GROUPS, "/services/register"),
  "/services/register",
  "and the same for /services/register",
);
eq(activeHref(GROUPS, "/services"), "/services", "the catalogue still matches itself");
eq(
  activeHref(GROUPS, "/admin/providers"),
  "/admin/providers",
  "on /admin/providers the specific entry beats /admin",
);

console.log("\n" + "=".repeat(70));
console.log("C) Sub-pages with no entry of their own fall to their parent");
console.log("=".repeat(70));
eq(activeHref(GROUPS, "/seasons/42"), "/seasons", "a season detail page lights مواسمي");
eq(activeHref(GROUPS, "/lands/abc/edit"), "/lands", "a nested land page lights أراضيّ");
eq(activeHref(GROUPS, "/mining/registry"), "/mining/registry", "registry beats /mining");

console.log("\n" + "=".repeat(70));
console.log("D) Prefixes must respect the path boundary");
console.log("=".repeat(70));
// Without the "/" boundary, /services would match /services-archive and /admin
// would match /administration.
ok(!matchesPath("/services", "/services-archive"), "/services ≠ /services-archive");
ok(!matchesPath("/admin", "/administration"), "/admin ≠ /administration");
ok(!matchesPath("/plan", "/planner"), "/plan ≠ /planner");

console.log("\n" + "=".repeat(70));
console.log("E) The section that opens on its own");
console.log("=".repeat(70));
eq(groupForPath(GROUPS, "/dashboard"), "استثماري", "محفظتي opens استثماري");
eq(groupForPath(GROUPS, "/plan"), "استثماري", "خططك opens استثماري");
eq(groupForPath(GROUPS, "/guide"), "الرئيسية", "the guide opens الرئيسية");
eq(groupForPath(GROUPS, "/services/mine"), "الخدمات التعاقدية", "provider page opens services");
eq(groupForPath(GROUPS, "/arc-canal"), "مشاريع ودراسات", "the canal opens its own section");
eq(groupForPath(GROUPS, "/login"), null, "an off-menu path opens nothing rather than guessing");
eq(activeHref(GROUPS, "/notifications"), null, "and highlights nothing");

console.log("\n" + "=".repeat(70));
console.log("F) The menu itself is well formed");
console.log("=".repeat(70));
const titles = GROUPS.map((g) => g.title);
ok(new Set(titles).size === titles.length, "section titles are unique — they key the accordion");
const hrefs = GROUPS.flatMap((g) => g.items.map((i) => i.href));
ok(new Set(hrefs).size === hrefs.length, "no href appears in two sections");
ok(GROUPS.every((g) => g.items.length > 0), "no empty section");
ok(hrefs.every((h) => h.startsWith("/")), "every entry is an internal path");

console.log("\n" + (fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`));
process.exit(fail === 0 ? 0 : 1);
