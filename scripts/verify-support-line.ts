/**
 * Support line (owner, 3 November 2026): the WhatsApp button appears only with a valid number, and the link is the
 * number's digits alone.
 *
 *   npx tsx scripts/verify-support-line.ts
 */
let failed = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) failed++;
};

async function main() {
  const prior = { ...process.env };
  const { supportLine } = await import("../src/lib/support");

  delete process.env.SUPPORT_WHATSAPP;
  ok(supportLine() === null, "no number set: no button");
  process.env.SUPPORT_WHATSAPP = "12345";
  ok(supportLine() === null, "a number too short to be one: no button");
  process.env.SUPPORT_WHATSAPP = "+249 91 234 5678";
  ok(supportLine()?.href === "https://wa.me/249912345678", "the link is the digits alone, «+» and spaces dropped");
  process.env.SUPPORT_HOURS_AR = "  من السبت إلى الخميس  ";
  delete process.env.SUPPORT_HOURS_EN;
  const line = supportLine();
  ok(line?.hours.ar === "من السبت إلى الخميس" && line.hours.en === null, "the hours as set, trimmed; none for a language not set");

  process.env = prior;
  console.log(failed ? `\n${failed} FAILED` : "\nOK");
  if (failed) process.exit(1);
}

main();
