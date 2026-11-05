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

Read on a GitHub runner on 5 November 2026 (`scripts/probe-feeds-now.ts`), whole as the API returned them:

- `almndranews-94492.json` — المندرة نيوز, 3 November 2026: «سجل الدولار الأمريكي 10300 جنيه للشراء و10500 جنيه
  للبيع», the buying price first and each named after its number.
- `almndranews-94193.json` — the same site, 28 October 2026: «وسجل أحدث رصد للدولار 10100 جنيه للشراء و10400 جنيه
  للبيع، مقارنة بـ9600 جنيه للشراء و9800 جنيه للبيع في تداولات الثلاثاء» — the day before's figures in the same
  sentence must not be taken.
- `almndranews-94359.json` — the same site, 1 November 2026: a review of the whole of October, full of dated figures
  («بلغ الدولار في 8 أكتوبر 8700 جنيه للشراء…»). The reader must take nothing from it.
- `alsudanalyoum-89860.json` — السودان اليوم, 1 November 2026: «وسجل الدولار الأمريكي 9,535 جنيهاً للشراء و10,120
  جنيهاً للبيع», with the riyal after it.
