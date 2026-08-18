#!/usr/bin/env python3
"""Trim a FAOSTAT bulk download to the slice this platform actually reads.

WHY THIS EXISTS

The reference table already holds production, yield and livestock stocks. It
does not hold *price*, and without price a phased feasibility study — the thing
the whole contracted-services arm is built around — cannot be finished. Nor
does it hold trade, so the "$400m of sheep exports" figure the platform repeats
stays a newspaper quotation rather than something a visitor can check.

Both live in FAOSTAT bulk downloads. Those are 12 MB and 273 MB zips, and the
build environment has no route to fao.org at all. A GitHub Actions runner does,
so the fetch happens there and this script reduces what it fetched to something
small enough to live in the repository and be loaded by a single SQL statement.

WHY TSV AND NOT CSV

FAOSTAT's own CSV quotes every field, and item names carry commas — "Almonds,
in shell". Parsing that in SQL means implementing RFC 4180 in plpgsql. Emitting
tab-separated output instead moves the parsing here, into a language that has a
CSV reader, and the loader becomes `split_part`. The script asserts that no
field contains a tab or a newline before it writes, so the guarantee is checked
rather than assumed.
"""

from __future__ import annotations

import argparse
import csv
import io
import sys
import zipfile

# The same twenty-eight areas already in the table. Matching the existing set
# deliberately: a price for a country whose yield we do not hold cannot be put
# beside anything.
AREAS = {
    "Algeria", "Argentina", "Australia", "Bangladesh", "Belgium", "Brazil",
    "Cambodia", "Canada", "China", "Egypt", "Ethiopia", "France", "India",
    "Iran (Islamic Republic of)", "Iraq", "Israel", "Japan", "Malaysia",
    "Mexico", "Mongolia", "New Zealand", "Niger", "Puerto Rico", "Rwanda",
    "Saudi Arabia", "Sudan",
    "United Kingdom of Great Britain and Northern Ireland",
    "United States of America",
}

# Trade is the big file, and trade for twenty-eight countries across every item
# would be six figures of rows to answer a handful of questions. These are the
# countries a Sudanese export figure is worth comparing against: the Gulf buyers,
# the African neighbours, and the large livestock exporters.
TRADE_AREAS = {
    "Sudan", "Saudi Arabia", "Egypt", "Ethiopia", "Australia", "New Zealand",
    "Brazil", "Argentina", "India", "China",
}

# Substring match, lower-cased, against the FAOSTAT item name. Matching on names
# rather than CPC codes is the more fragile of the two choices, so the script
# prints every item it kept — a silently empty slice is the failure mode worth
# guarding against, and a printed list makes it visible in the run log.
TRADE_ITEM_KEYWORDS = (
    "sheep", "goat", "cattle", "camel", "meat of", "hides", "skins",
    "sesame", "groundnut", "sorghum", "millet", "gum", "date", "cotton",
    "onion", "watermelon", "sugar", "wheat", "maize", "sunflower",
    "hibiscus", "bean", "milk", "cheese", "butter", "egg", "honey",
)

FIRST_YEAR = 2017


def open_member(zf: zipfile.ZipFile) -> io.TextIOWrapper:
    """Open the single CSV inside a FAOSTAT zip, whatever it is named."""
    members = [n for n in zf.namelist() if n.lower().endswith(".csv")]
    if not members:
        raise SystemExit(f"no CSV inside the archive: {zf.namelist()}")
    # The normalized archives carry one data file plus, sometimes, small
    # code-list companions. The data file is the largest.
    member = max(members, key=lambda n: zf.getinfo(n).file_size)
    print(f"  reading {member} ({zf.getinfo(member).file_size:,} bytes)")
    raw = zf.open(member, "r")
    # FAOSTAT bulk files are ISO-8859-1, not UTF-8, and decoding them as UTF-8
    # fails on the accented country names. Latin-1 never fails, so try the
    # stricter one first and fall back rather than guessing.
    head = raw.read(65536)
    raw.close()
    encoding = "utf-8"
    try:
        head.decode("utf-8")
    except UnicodeDecodeError:
        encoding = "latin-1"
    print(f"  encoding: {encoding}")
    return io.TextIOWrapper(zf.open(member, "r"), encoding=encoding, newline="")


def keep_price(row: dict[str, str]) -> bool:
    if row.get("Area") not in AREAS:
        return False
    # The Prices domain carries monthly rows alongside the annual one. Only the
    # annual figure is comparable with an annual yield.
    months = (row.get("Months") or "Annual value").strip()
    if months not in ("Annual value", "Annual", ""):
        return False
    return "USD" in (row.get("Element") or "")


def keep_trade(row: dict[str, str]) -> bool:
    if row.get("Area") not in TRADE_AREAS:
        return False
    element = (row.get("Element") or "").strip()
    if element not in ("Export quantity", "Export value",
                       "Import quantity", "Import value"):
        return False
    item = (row.get("Item") or "").lower()
    return any(k in item for k in TRADE_ITEM_KEYWORDS)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", required=True)
    ap.add_argument("--domain", required=True, choices=("PP", "TCL"))
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    keep = keep_price if args.domain == "PP" else keep_trade

    seen: dict[tuple[str, str, str, int], tuple[str, str, str]] = {}
    scanned = 0
    items: set[str] = set()

    print(f"opening {args.zip}")
    with zipfile.ZipFile(args.zip) as zf:
        with open_member(zf) as handle:
            reader = csv.DictReader(handle)
            missing = {"Area", "Element", "Item", "Year", "Unit", "Value"} - set(
                reader.fieldnames or []
            )
            if missing:
                raise SystemExit(
                    f"unexpected columns {reader.fieldnames}; missing {sorted(missing)}"
                )
            for row in reader:
                scanned += 1
                year_text = (row.get("Year") or "").strip()
                if not year_text.isdigit() or int(year_text) < FIRST_YEAR:
                    continue
                if not keep(row):
                    continue
                value = (row.get("Value") or "").strip()
                try:
                    float(value)
                except ValueError:
                    continue
                key = (row["Area"], row["Element"], row["Item"], int(year_text))
                # Last row wins, matching the loader's own upsert.
                seen[key] = (
                    (row.get("Unit") or "").strip(),
                    value,
                    (row.get("Flag") or "").strip(),
                )
                items.add(row["Item"])

    print(f"scanned {scanned:,} rows, kept {len(seen):,}")
    print(f"distinct items kept ({len(items)}):")
    for name in sorted(items):
        print(f"    {name}")

    if not seen:
        raise SystemExit("kept nothing — the filter is wrong, refusing to write")

    with open(args.out, "w", encoding="utf-8", newline="") as out:
        for (area, element, item, year), (unit, value, flag) in sorted(seen.items()):
            fields = [args.domain, area, element, item, str(year), unit, value, flag]
            for field in fields:
                if "\t" in field or "\n" in field or "\r" in field:
                    raise SystemExit(f"field contains a separator: {field!r}")
            out.write("\t".join(fields) + "\n")

    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
