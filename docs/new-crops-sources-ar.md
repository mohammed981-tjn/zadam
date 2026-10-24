# المحاصيل المضافة في ٢٤ أكتوبر ٢٠٢٦ ومصادرها (البند ١٥٦)

طلب المالك: «المحاصيل المعروضة في المنصّة قليلة جداً في القائمة عند الاختيار، زوّدها». القاعدة التي وُضعت للتوسيع: **لا يدخل محصولٌ ينقصه مصدرٌ لأيٍّ من أربعة أشياء** — أيّام مراحل النموّ، ومعامل الماء (Kc)، وموعد الزراعة في السودان، وتحمّل الملوحة. فدخل ١٧ محصولاً من ٣٠ بُحثت، وأُسقط ١٣ بسببٍ مكتوب. القائمة صارت ٢٩ محصولاً.

الأرقام كلّها في `content/crops/sourced-2026-10-24.json` (بروابطها واقتباساتها)، وبوّابة `scripts/verify-new-crops.ts` تُفشل البناء إن اختلف الكود عنها.

**المصادر العامّة:** FAO-56 (الجدولان ١١ و١٢): <https://www.fao.org/4/x0490e/x0490e0b.htm> · FAO-29 (الجدولان ٤ و٥): <https://www.fao.org/4/t0234e/T0234E03.htm>

## ما دخل

| المفتاح | المحصول | المراحل (يوم) | Kc أوّل/وسط/آخر | موعد الزراعة | الملوحة | مصدر الموعد |
|---|---|---|---|---|---|---|
| `faba_bean` | فول مصري | 20/30/35/15 | 0.5/1.15/0.3 | نوفمبر | MS · 1.5 | [peer-reviewed](https://www.actahort.org/books/143/143_22.htm) |
| `potato` | بطاطس | 25/30/45/30 | 0.5/1.15/0.75 | نوفمبر | MS · 1.7 | [peer-reviewed](https://doi.org/10.1017/s0021859600077042) |
| `sunflower` | عبّاد الشمس | 25/35/45/25 | 0.35/1.15/0.35 | نوفمبر | MS | [peer-reviewed](https://www.jaeid.it/index.php/jaeid/article/download/11096/9587/26021) |
| `safflower` | قُرطم | 35/55/60/40 | 0.35/1.15/0.25 | نوفمبر | MT | [conference paper](https://www.tropentag.de/2012/abstracts/links/Khalil_eL39ynm2.pdf) |
| `barley` | شعير | 15/25/50/30 | 0.3/1.15/0.25 | نوفمبر | T · 8.0 | [peer-reviewed](https://onlinejournals.uofk.edu/uofkjas/en/article/download/1963/1765/1837) |
| `rice` | أرز | 30/30/80/40 | 1.05/1.2/0.75 | يوليو | MS · 3.0 | [peer-reviewed](https://innspub.net/influence-of-different-sowing-dates-on-growth-and-yield-of-direct-seeded-rice-oryza-sativa-l-in-semi-arid-zone-sudan/) |
| `cowpea` | لوبيا | 20/30/30/20 | 0.4/1.05/0.35 | يونيو | MT · 4.9 | [Netherlands Enterprise Agency](https://www.rvo.nl/sites/default/files/2025-06/Beyond_wheat_imports_Sudans_local_climate-resilient_crops_as_the_staple_foods_of_tomorrow.pdf) |
| `watermelon` | بطيخ | 10/20/20/30 | 0.4/1.0/0.75 | يناير | MS | [Sudan extension bulletin](https://senassudan.com/index.php/%D8%A7%D9%84%D8%A8%D8%B3%D8%A7%D8%AA%D9%8A%D9%86/%D8%A7%D9%84%D9%81%D8%A7%D9%83%D9%87%D8%A9/70-%D8%A7%D9%84%D8%A8%D8%B7%D9%8A%D8%AE) |
| `sweet_melon` | شمّام | 30/45/65/20 | 0.5/1.05/0.75 | أكتوبر | MS | [Khartoum State technology-transfer and extension](http://kenanaonline.com/users/ershadkhartoum/posts/672773) |
| `cucumber` | خيار | 25/35/50/20 | 0.6/1.0/0.75 | أكتوبر | MS · 2.5 | [Sudan extension bulletin](https://www.senassudan.com/index.php/2017-05-25-13-37-40/2017-05-25-11-19-20) |
| `eggplant` | باذنجان | 30/40/40/20 | 0.6/1.05/0.9 | أغسطس | MS | [peer-reviewed](https://www.actahort.org/books/49/49_21.htm) |
| `sweet_pepper` | فلفل حلو | 30/40/110/30 | 0.6/1.05/0.9 | أغسطس | MS · 1.5 | [peer-reviewed](https://www.actahort.org/books/49/49_21.htm) |
| `cabbage` | كرمب (ملفوف) | 40/60/50/15 | 0.7/1.05/0.95 | سبتمبر | MS · 1.8 | [Sudan extension bulletin](https://www.senassudan.com/index.php/%D8%A7%D9%84%D8%A8%D8%B3%D8%A7%D8%AA%D9%8A%D9%86/%D8%A7%D9%84%D8%AE%D8%B6%D8%B1/67-%D8%A7%D9%84%D9%83%D8%B1%D9%85%D8%A8) |
| `carrot` | جزر | 20/30/30/20 | 0.7/1.05/0.95 | نوفمبر | S · 1.0 | [peer-reviewed](https://doi.org/10.9734/jaeri/2025/v26i4692) |
| `zucchini` | كوسة | 25/35/25/15 | 0.5/0.95/0.75 | أكتوبر | MT · 4.7 | [Sudan extension bulletin](https://www.senassudan.com/index.php/%D8%A7%D9%84%D8%A8%D8%B3%D8%A7%D8%AA%D9%8A%D9%86/%D8%A7%D9%84%D8%AE%D8%B6%D8%B1/783-%D9%82%D8%B1%D8%B9-%D8%A7%D9%84%D9%83%D9%88%D8%B3%D8%A7) |
| `sweet_potato` | بطاطا (بامبي) | 15/30/50/30 | 0.5/1.15/0.65 | يوليو | MS · 1.5 | [Sudan extension bulletin](https://www.senassudan.com/index.php/%D8%A7%D9%84%D8%A8%D8%B3%D8%A7%D8%AA%D9%8A%D9%86/%D8%A7%D9%84%D8%AE%D8%B6%D8%B1/60-%D8%A7%D9%84%D8%A8%D8%A7%D9%85%D8%A8%D9%8A) |
| `citrus` | موالح (قريب فروت) | 60/90/120/95 | 0.7/0.65/0.7 | — (معمَّر) | S · 1.8 | [Sudan extension bulletin](https://www.senassudan.com/index.php/%D8%A7%D9%84%D8%A8%D8%B3%D8%A7%D8%AA%D9%8A%D9%86/%D8%A7%D9%84%D9%81%D8%A7%D9%83%D9%87%D8%A9) |

الملوحة: T يتحمّل · MT يتحمّل بقدر · MS حسّاس بقدر · S حسّاس؛ والرقم ECe بـdS/m لمحصولٍ كامل (من الجدول ٤، وغائبٌ حيث لا صفّ للمحصول فيه).

## ما أُسقط وسببه

- **حمّص** (`chickpea`): No FAO-56 Table 11 row (Table 11 legumes list beans, faba bean, cowpea, groundnut, lentil, peas, soybeans only), so there are no stage lengths. Table 12 has Kc (0.4/1.00/0.35) but a crop needs both. Chickpea is also absent from FAO-29 Tables 4 and 5.
- **عدس** (`lentil`): FAO-56 is complete (Table 11 'Oct/Nov, Arid Region' 25/35/70/40 = 170 d; Table 12 0.4/1.10/0.30), but no source with a lentil sowing month in Sudan was found (the Sudanese lentil papers found describe weed control and yield without stating the month), and lentil is not in FAO-29 Tables 4 and 5.
- **ثوم** (`garlic`): FAO-56 Table 12 has garlic (Kc mid 1.00, end 0.70) but Table 11 has no garlic row, so no stage lengths. Also not in FAO-29 Tables 4 and 5. No Sudan sowing source gathered.
- **موز** (`banana`): FAO-56 has it (Table 11 1st year 120/90/120/60 = 390 d, Mar, Mediterranean; Table 12 1st year 0.50/1.10/1.00), but the Sudanese bulletin found says only 'the most suitable time to plant banana in Sudan is the beginning of the autumn season' (no month), and banana is not in FAO-29 Tables 4 and 5.
- **فاصوليا جافة** (`dry_beans`): Not pursued: not a major Sudanese crop, and no Sudanese sowing source was gathered. (FAO-56 and FAO-29 do list it: Table 11 'June, Pakistan, Calif.' 15/25/35/20 = 95 d; Table 12 0.4/1.15/0.35; ECe 1.0, class S.) Cowpea covers the Sudanese bean crop.
- **قرع / يقطين** (`pumpkin`): FAO-56 and FAO-29 are available, but the only Sudan sowing source found is a non-authoritative website (ecosudan.net, month 8) and an Egyptian bulletin that is not about Sudan.
- **خس** (`lettuce`): FAO-56/FAO-29 available (Table 11 'Oct/Nov, Arid Region' 25/35/30/10 = 100 d; ECe 1.3, MS), but the only Sudan sowing source found is ecosudan.net (non-authoritative) and an Egyptian ministry guide.
- **ذرة سكرية** (`sweet_corn`): No Sudanese sowing source found (results were Turkish, Egyptian and Brazilian trials). Table 11 'Oct/Dec Arid Climate' row is also garbled in the text edition (footnote 3 merged into the late-season cell), so it was not relied on.
- **بامية** (`okra`): Not in FAO-56 Table 11 or Table 12. (FAO-29 Table 5 lists okra as Sensitive, with no ECe figure.)
- **حلبة** (`fenugreek`): Not in FAO-56 Table 11 or Table 12, and not in FAO-29. (A Sudan extension bulletin says October-November sowing, but the water figures cannot be sourced.)
- **مانجو** (`mango`): Not in FAO-56 Table 11 or Table 12 (checked against the table text). In FAO-29 Table 5 as Sensitive only.
- **كركديه** (`hibiscus_roselle`): Not in FAO-56 Table 11 or Table 12, and not in FAO-29 Tables 4 and 5.
- **صمغ عربي** (`gum_arabic`): Not in FAO-56 Table 11 or Table 12. It is also rain-fed in the gum belt, so an irrigation requirement does not apply.

## ما يجب أن يعرفه من يقرأ الأرقام

- قُرئت صفوف الجدولين ١١ و١٢ من نسخة PDF لـFAO-56 لأنّ fao.org لم يكن متاحاً من الحاوية؛ وتطابق Kc الوسط والأخير مع نسخة الويب، أمّا Kc الأوّل وبعض خلايا الجدول ١١ فاعتمادهما على نصّ الـPDF وحده.
- اللوبيا: مراحل FAO تجمع ١٠٠ يوم والمجموع المطبوع ١١٠؛ أُخذت المراحل كما طُبعت ولم تُضَف أيّام.
- البطاطس: «٣٠/٤٥» في المرحلة الوسطى، واعتُمد ٤٥ لأنّ ٢٥+٣٠+٤٥+٣٠ = ١٣٠ هو المجموع المطبوع. الجزر: «٥٠/٣٠»، واعتُمد ٣٠ لأنّه وحده يعطي ١٠٠.
- عبّاد الشمس والقرطم: Kc المرويّ كما في حاشية الجدول؛ اللوبيا: Kc الأخير لحبٍّ جافّ؛ الأرز: Kc الأخير منتصف المدى (٠٫٩٠–٠٫٦٠) كما اعتُمد للقطن.
- الباذنجان والفلفل والكرمب: الشهر هو شهر **المشتل**، ولا تقول المصادر موعد النقل إلى الحقل، فلم يُفترض إزاحة.
- الباذنجان والفلفل يستندان إلى تجربةٍ واحدة (١٩٧٥) قارنت موعدين فقط؛ والشعير إلى تجارب علف؛ ونشرات senassudan.com لا يذكر موقعها ناشرها، فعُدّت دليلاً إرشاديّاً (تسندها: البطيخ والخيار والكرمب والكوسة والبطاطا والموالح).
- الموالح: معمَّرة، والمصدر يخصّ القريب فروت وحده، وFAO-29 يصنّف كلّ الحمضيات «حسّاسة». لذلك سُمّيت «موالح (قريب فروت)» ولا موعد لها في `SOWING`: تبقى في «بلا موعد» كالنخيل ولا يُحسب موسمها في شهرٍ مُخمَّن.
- لا اقتصاديات لهذه المحاصيل (غلّة وسعر وتكلفة)، ولا معيار إنتاج FAOSTAT بعد: تظهر المساحة والماء والملوحة، وتبقى خانات المال فارغةً بدل أرقامٍ مخمَّنة (البندان ١٧٧ و١٧٨).
