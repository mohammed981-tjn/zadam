/**
 * Checks the risk section of the feasibility study (backlog 112).
 *
 * The properties a wrong answer would cost money on: a blank figure is never
 * read as a zero, the expected loss is value × share ÷ years and nothing else,
 * a risk switched off counts for nothing, and the bad year is the worst single
 * risk — not all of them at once.
 */

import { FARM_RISKS, defaultSettings, expectedLossUsd, summariseRisks, type RiskSetting } from "../src/lib/farmRisks";
import { SERVICE_BY_KEY } from "../src/lib/services";

let fail = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(60)} ${detail}`);
}

console.log("\nThe risk library");
{
  check("every risk has at least one source", FARM_RISKS.every((r) => r.sources.length > 0 && r.sources.every((s) => /^https?:\/\//.test(s.url))));
  check("every risk says how to handle it, in both languages", FARM_RISKS.every((r) => r.treatment.ar.length > 20 && r.treatment.en.length > 20));
  check("every linked service exists in the catalogue", FARM_RISKS.every((r) => r.services.every((k) => Boolean(SERVICE_BY_KEY[k]))));
  check(
    "a default figure always comes with the words for what it is",
    FARM_RISKS.every((r) => (r.everyYears === null && r.lossPct === null && r.reserveUsd === null) || r.basis !== null),
  );
  check(
    "loss ranges are percentages, low before high",
    FARM_RISKS.every((r) => r.lossPct === null || (r.lossPct[0] >= 0 && r.lossPct[0] <= r.lossPct[1] && r.lossPct[1] <= 100)),
  );
}

const base: RiskSetting = { key: "locust", applies: true, everyYears: 10, lossPct: 30, reserveUsd: null };

console.log("\nExpected loss");
{
  check("value × share ÷ years", expectedLossUsd(10_000, base) === 300, String(expectedLossUsd(10_000, base)));
  check("switched off counts for nothing", expectedLossUsd(10_000, { ...base, applies: false }) === null);
  check("a blank frequency is not a zero", expectedLossUsd(10_000, { ...base, everyYears: null }) === null);
  check("a blank loss is not a zero", expectedLossUsd(10_000, { ...base, lossPct: null }) === null);
  check("no price, no dollar figure", expectedLossUsd(null, base) === null);
  check("a loss above 100% is capped at the whole crop", expectedLossUsd(10_000, { ...base, everyYears: 1, lossPct: 150 }) === 10_000);
}

console.log("\nAgainst the season");
{
  const settings: RiskSetting[] = [
    base,
    { key: "pests", applies: true, everyYears: 5, lossPct: 15, reserveUsd: null },
    { key: "drought", applies: true, everyYears: 5, lossPct: null, reserveUsd: null },
    { key: "borehole", applies: true, everyYears: null, lossPct: null, reserveUsd: 1000 },
    { key: "theft", applies: false, everyYears: null, lossPct: null, reserveUsd: null },
  ];
  const s = summariseRisks(settings, 10_000, 4_000);
  check("expected total sums only what could be counted", s.expectedTotalUsd === 300 + 300, String(s.expectedTotalUsd));
  check("the reserve is held back once", s.reserveTotalUsd === 1000);
  check("margin after = margin − expected − reserve", s.marginAfterUsd === 4_000 - 600 - 1000, String(s.marginAfterUsd));
  check("a risk missing a figure is named, not hidden", s.uncounted.length === 1 && s.uncounted[0] === "drought", s.uncounted.join(","));
  check("a risk switched off is not listed as missing", !s.uncounted.includes("theft"));
  check("the bad year is the worst single risk", s.badYear?.key === "locust" && s.badYear.marginUsd === 4_000 - 3_000, JSON.stringify(s.badYear));
  check("no price, no bad year", summariseRisks(settings, null, null).badYear === null);
}

console.log("\nDefaults");
{
  const d = defaultSettings();
  check("one setting per risk", d.length === FARM_RISKS.length);
  check("the borehole starts switched off — most land is not on one", d.find((s) => s.key === "borehole")?.applies === false);
  check("theft starts with no figure — none was found for Sudan", d.find((s) => s.key === "theft")?.lossPct === null);
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
if (fail) process.exit(1);
