# Price feed fixtures

Real articles, as the sites' WordPress REST API returns them
(`/wp-json/wp/v2/posts/<id>?_fields=id,date,link,title,content`), read on
22 October 2026 and trimmed to the parts the readers use. The numbers are the
articles' own. `scripts/verify-price-feeds.ts` runs the readers on them.

- `iqraa24-45070.json` — Bank of Khartoum's daily table, 21 October 2026.
- `bajnews-201602.json` — the parallel market, 21 October 2026 (with the bank's
  figures in an earlier paragraph, which the parallel reader must not take, and
  which the bank-sentence reader does take: «… في بنك الخرطوم ليُسجل سعر شراء
  الدولار 4,850 جنيهًا، مقابل 4,886 جنيهًا للبيع»).
- `sudafax-585058.json` — El Obeid's daily list, 14 October 2026, with the
  paragraphs of increases after it, which are not prices.
- `iqraa24-43999.json` — the same site on 20 October 2026: a table headed
  «بنك الخرطوم المركزي» (no such bank) with buying 4200 above selling 3700.
  The reader must take nothing from it.
