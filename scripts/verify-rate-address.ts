/**
 * عنوان المتّصل كما يعدّه الحدّ (SEC-9، البند ١٦٣): عنوان IPv4 كما هو، وعنوان IPv6 بأوّل أربع مجموعاتٍ
 * (/64) فلا يدور مشتركٌ واحد على آلاف «العناوين»، وعنوانٌ مكتوبٌ بصيغة IPv4 داخل IPv6 هو العنوان نفسه.
 *
 *   npx tsx scripts/verify-rate-address.ts
 */
import { clientAddress, networkOf } from "../src/lib/rateLimit";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

ok(networkOf("203.0.113.9") === "203.0.113.9", "an IPv4 address is kept");
ok(networkOf("unknown") === "unknown", "and so is a value that is not an address");
ok(
  networkOf("2001:db8:aaaa:bbbb:1:2:3:4") === networkOf("2001:db8:aaaa:bbbb:ffff:eeee:dddd:cccc"),
  "two addresses of one /64 count as one caller",
);
ok(
  networkOf("2001:db8:aaaa:bbbb:1:2:3:4") !== networkOf("2001:db8:aaaa:bbbc:1:2:3:4"),
  "two different /64 networks stay two",
);
ok(networkOf("2001:DB8:0:0:0:0:0:1") === networkOf("2001:db8::1"), "the short form and the long form are one");
ok(networkOf("2001:db8:0:0:1::1") === "2001:db8:0:0::/64", "leading zeros are dropped, the key is always the same shape");
ok(networkOf("::1") === "0:0:0:0::/64", "the loopback has a key too");
ok(networkOf("::ffff:203.0.113.9") === "203.0.113.9", "an IPv4 address in IPv6 dress is that IPv4 address");
ok(networkOf("2001:db8::zz") === "2001:db8::zz", "a malformed address is kept as it came, not guessed");
ok(networkOf("2001:db8:aaaa:bbbb:1:2:3:4").length + "assistant:".length <= 64, "the key still fits the 64-character column check");

const h = new Headers({ "x-forwarded-for": "6.6.6.6, 2001:db8:aaaa:bbbb:1:2:3:4" });
ok(clientAddress(h) === "2001:db8:aaaa:bbbb::/64", "clientAddress takes the address the edge appended, then its /64");
ok(clientAddress(new Headers()) === "unknown", "and says unknown when there is none");

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
