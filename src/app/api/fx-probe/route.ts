import { NextResponse } from "next/server";

/**
 * TEMPORARY — backlog 133. Reads WFP's Sudan price file on HDX (which the
 * development sandbox cannot reach) and returns every faba-bean row for
 * Khartoum and Dongola, so the figure on /market can be checked against the
 * rows it was trimmed from. One fixed URL, no parameters. Removed before merge.
 */

export const dynamic = "force-dynamic";

const CSV =
  "https://data.humdata.org/dataset/369e003b-f0af-4e48-99d7-34fc85b44635/resource/8fea18b2-615f-4af5-9bd5-85cc31a25ffd/download/wfp_food_prices_sdn.csv";

function split(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export async function GET() {
  const res = await fetch(CSV, { cache: "no-store" });
  if (!res.ok) return NextResponse.json({ error: res.status }, { status: 502 });
  const lines = (await res.text()).split(/\r?\n/).filter(Boolean);
  const head = split(lines[0].replace(/^﻿/, ""));
  const idx = (k: string) => head.indexOf(k);
  const rows = lines
    .slice(1)
    .map(split)
    .filter((r) => /fava|faba|beans/i.test(r[idx("commodity")] ?? ""))
    .filter((r) => /Khartoum|Dongola|Omdurman|Bahri/i.test(`${r[idx("market")]} ${r[idx("admin1")]} ${r[idx("admin2")] ?? ""}`))
    .filter((r) => (r[idx("date")] ?? "") >= "2025-06-01")
    .map((r) => Object.fromEntries(head.map((k, i) => [k, r[i]])));
  // Where WFP collects each town's prices: the town and the locality (admin2) it sits in.
  const places = new Map<string, string>();
  for (const r of lines.slice(1).map(split)) {
    if ((r[idx("date")] ?? "") < "2026-01-01") continue;
    places.set(`${r[idx("market")]} | ${r[idx("admin1")]} | ${r[idx("admin2")]}`, r[idx("market_id")]);
  }
  return NextResponse.json({ columns: head, count: rows.length, places: [...places.keys()].sort(), rows });
}
