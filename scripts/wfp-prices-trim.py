#!/usr/bin/env python3
"""Trim WFP's Sudan food-price file on HDX to the latest month per town.

WHY THIS EXISTS

The market page already shows FEWS NET's monthly sorghum and millet, and the
WFP Market Monitor copied by hand into content/market/wfp.json. WFP also
publishes its whole price database for Sudan as one CSV on the Humanitarian
Data Exchange — about nineteen towns, cereals beside meat, goat, sugar, oil and
onions, monthly since 2001. It is 2.9 MB and grows every month, and the build
environment cannot reach data.humdata.org; a GitHub Actions runner can. So the
fetch happens there and this script keeps only what the page shows: for each
town, each item's newest price, with the month before and the same month a
year before it when the file has them.

Every number written is a number read in the file. Nothing is averaged or
converted; a missing month stays missing.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import date

DATASET = "https://data.humdata.org/dataset/wfp-food-prices-for-sudan"


def month(d: str) -> str:
    return d[:7]


def shift(ym: str, months: int) -> str:
    y, m = int(ym[:4]), int(ym[5:7])
    m += months
    while m < 1:
        m += 12
        y -= 1
    while m > 12:
        m -= 12
        y += 1
    return f"{y:04d}-{m:02d}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    with open(args.csv, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    need = {"date", "admin1", "market", "latitude", "longitude", "commodity", "unit", "pricetype", "currency", "price"}
    if not rows or not need.issubset(rows[0].keys()):
        print(f"unexpected columns: {sorted(rows[0].keys()) if rows else 'no rows'}", file=sys.stderr)
        return 1

    # (market, commodity, unit, pricetype) -> {YYYY-MM: price}
    series: dict[tuple[str, str, str, str], dict[str, float]] = {}
    places: dict[str, dict] = {}
    for r in rows:
        if r["currency"] != "SDG" or r.get("priceflag", "actual") != "actual":
            continue
        if r["commodity"].startswith("Exchange rate"):
            continue
        try:
            price = float(r["price"])
        except ValueError:
            continue
        if price <= 0:
            continue
        if price.is_integer():
            price = int(price)
        key = (r["market"], r["commodity"], r["unit"], r["pricetype"])
        series.setdefault(key, {})[month(r["date"])] = price
        places[r["market"]] = {
            "market": r["market"],
            "state": r["admin1"],
            "lat": float(r["latitude"]),
            "lng": float(r["longitude"]),
        }

    latest_overall = max(m for s in series.values() for m in s)
    # A town whose newest figure is more than a year older than the file's
    # newest month is history, not a price.
    cutoff = shift(latest_overall, -12)

    markets: dict[str, dict] = {}
    for (mk, commodity, unit, ptype), s in series.items():
        last = max(s)
        if last < cutoff:
            continue
        item = {"commodity": commodity, "unit": unit, "type": ptype.lower(), "month": last, "price": s[last]}
        prev, year = shift(last, -1), shift(last, -12)
        if prev in s:
            item["prevMonth"] = s[prev]
        if year in s:
            item["yearAgo"] = s[year]
        m = markets.setdefault(mk, {**places[mk], "items": []})
        m["items"].append(item)

    for m in markets.values():
        m["latest"] = max(i["month"] for i in m["items"])
        m["items"].sort(key=lambda i: (i["type"] != "retail", i["commodity"], i["unit"]))

    out = {
        "note": "Trimmed by scripts/wfp-prices-trim.py from WFP's Sudan price database on HDX. Each price is read in the file for the month given; prevMonth and yearAgo are the same item's figures one month and twelve months earlier, left out when the file has none. Prices are Sudanese pounds.",
        "source": DATASET,
        "license": "CC BY-IGO",
        "fetched": date.today().isoformat(),
        "latest": latest_overall,
        "markets": sorted(markets.values(), key=lambda m: m["market"]),
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    n = sum(len(m["items"]) for m in out["markets"])
    print(f"{len(out['markets'])} towns, {n} items, newest month {latest_overall}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
