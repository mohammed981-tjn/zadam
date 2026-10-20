import { daysBetween, latestByItem, type HealthRecord, type HerdTag } from "@/lib/herdHealth";
import type { LivestockSpecies } from "@/types/database";

/**
 * قائمة التحضير للتصدير (البند ١١٧) — ما يطلبه السودان وبلد الوصول، كلٌّ بمصدره.
 *
 * Every line here restates a published requirement, with its link, its date
 * and what kind of source it is; the research behind it is in
 * docs/studies/livestock-export-requirements.md. Where the herd's own record can answer
 * a line (an ear tag on every head, a vaccination entered), the line is
 * checked against it; where it cannot (a laboratory test at the quarantine, a
 * certificate from the state), it says what to do and who does it.
 *
 * What it never says: that an animal is healthy, vaccinated "per protocol",
 * certified, or accepted. Only the veterinary authority's inspection, tests
 * and certificate establish those, and the importing country decides at its
 * port. The verdict at the top is «مستوفٍ لقائمة التحضير», not «جاهز للتصدير».
 */

export type ExportDestination = "sa" | "eg";
export const EXPORT_DESTINATIONS: ExportDestination[] = ["sa", "eg"];
export const DESTINATION_NAME: Record<ExportDestination, { ar: string; en: string }> = {
  sa: { ar: "السعوديّة", en: "Saudi Arabia" },
  eg: { ar: "مصر", en: "Egypt" },
};

export type SourceKind = "official" | "news" | "research";

export interface Source {
  label: string;
  url: string;
  /** As the source dates it; "undated" when it does not. */
  date: string;
  kind: SourceKind;
  /** False for anything before 2024 — shown as older. */
  current: boolean;
}

export type CheckStatus = "ok" | "missing" | "warn" | "info";

export interface CheckLine {
  id: string;
  status: CheckStatus;
  ar: string;
  en: string;
  /** What the herd's record shows, or what to do — one sentence. */
  detailAr: string;
  detailEn: string;
  source: Source;
}

const SRC = {
  saudiGuide2026: {
    label: "جريدة أمّ القرى — دليل تراخيص الاستيراد، المواشي",
    url: "https://www.uqn.gov.sa/decisions-and-regulations/4001993",
    date: "2026-10-02",
    kind: "official",
    current: true,
  },
  mewaQuarantine: {
    label: "وزارة البيئة والمياه والزراعة السعوديّة — دليل الحجر البيطري",
    url: "https://www.mewa.gov.sa/ar/InformationCenter/DocsCenter/RulesLibrary/Documents/AgriculturalVeterinaryQuarantine.pdf",
    date: "2025-10-14",
    kind: "official",
    current: true,
  },
  mewaWeights2019: {
    label: "عكاظ عن وزارة البيئة السعوديّة — الأوزان القياسيّة",
    url: "https://www.okaz.com.sa/local/na/1713814",
    date: "2019-03-21",
    kind: "news",
    current: false,
  },
  femaleBan2019: {
    label: "قرار منع تصدير إناث المواشي بكلّ أنواعها (2019)",
    url: "https://www.sudaninet.net/6917",
    date: "2019-07-22",
    kind: "news",
    current: false,
  },
  quarantineAct2004: {
    label: "قانون صادر ووارد الحيوانات الحيّة واللحوم (الحجر البيطري) لسنة 2004",
    url: "https://faolex.fao.org/docs/pdf/sud189344E.pdf",
    date: "2004-12-29",
    kind: "official",
    current: false,
  },
  cbos2024: {
    label: "بنك السودان المركزي — منشور 1/2024: طرق الدفع لتصدير المواشي الحيّة",
    url: "https://cbos.gov.sd/ar/content/%D9%85%D9%86%D8%B4%D9%88%D8%B1-%D8%B1%D9%82%D9%85-12024-%D8%B7%D8%B1%D9%82-%D8%A7%D9%84%D8%AF%D9%81%D8%B9-%D9%84%D8%AA%D8%B5%D8%AF%D9%8A%D8%B1-%D8%A7%D9%84%D9%85%D9%88%D8%A7%D8%B4%D9%8A-%D8%A7%D9%84%D8%AD%D9%8A%D8%A9",
    date: "2024-03-06",
    kind: "official",
    current: true,
  },
  egyptSlaughter: {
    label: "الهيئة العامّة للاستثمار بمصر — الشروط الصحّيّة لحيوانات الذبح المستوردة",
    url: "https://www.gafi.gov.eg/Arabic/StartaBusiness/InvestmentZones/SiteAssets/Pages/Inland/%D8%A7%D9%84%D8%AA%D8%B1%D8%AE%D9%8A%D8%B5%20%D8%A7%D9%84%D8%B5%D8%AD%D9%89%20%D8%A7%D9%84%D8%A8%D9%8A%D8%B7%D8%B1%D9%89.pdf",
    date: "undated",
    kind: "official",
    current: false,
  },
  egyptCattle2024: {
    label: "أسواق المعلومات عن مسؤول مصري — ماشية السودان للذبح الفوري",
    url: "https://www.aswaqinformation.com/190682",
    date: "2024-01-10",
    kind: "news",
    current: true,
  },
  egyptQuarantine: {
    label: "وزارة الزراعة الأمريكيّة — تقرير لوائح الاستيراد في مصر",
    url: "https://apps.fas.usda.gov/newgainapi/api/Report/DownloadReportByFileName?fileName=Food+and+Agricultural+Import+Regulations+and+Standards+Country+Report_Cairo_Egypt_EG2022-0001.pdf",
    date: "2022",
    kind: "research",
    current: false,
  },
  egyptCamels2023: {
    label: "المصري اليوم — الإبل السودانيّة في محجر الشلاتين",
    url: "https://www.almasryalyoum.com/news/details/2955676",
    date: "2023-08-12",
    kind: "news",
    current: false,
  },
} satisfies Record<string, Source>;

/** MEWA's standard weights, March 2019 (news report; still cited in 2025). */
const STANDARD_WEIGHT_KG: Partial<Record<LivestockSpecies, number>> = { sheep: 35, goat: 20, cattle: 280, camel: 200 };

export interface ChecklistInput {
  species: LivestockSpecies;
  headCount: number;
  records: HealthRecord[];
  tags: HerdTag[];
  /** Diseases FAO holds for the herd's state in the alert window; null when the herd has no land or FAO could not be read. */
  stateDiseases: string[] | null;
  today: string;
}

const small = (s: LivestockSpecies) => s === "sheep" || s === "goat";

/** The same day `n` calendar months later, as an ISO day (31 Jan + 1 month = 3 Mar, as Date does). */
export function addMonths(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** A standing vaccination covering every head, or the shortfall. */
function vaccination(records: HealthRecord[], key: string, headCount: number) {
  const r = latestByItem(records.filter((x) => x.kind === "vaccination")).get(key);
  return { record: r ?? null, whole: !!r && r.heads >= headCount };
}

export function buildChecklist(dest: ExportDestination, h: ChecklistInput): CheckLine[] {
  const lines: CheckLine[] = [];
  const present = h.tags.filter((t) => t.status === "present").length;

  // ── السودان: يسري على كلّ وجهة ───────────────────────────────────────────
  lines.push({
    id: "females",
    status: "info",
    ar: "الذكور وحدها",
    en: "Males only",
    detailAr: "تصدير إناث المواشي ممنوعٌ بكلّ أنواعها منذ 2019، وما زال المسؤولون يعاملونه نافذاً. لا تعرض أنثى على المصدّر.",
    detailEn: "Exporting female livestock of any kind has been banned since 2019, and officials still treat the ban as in force. Do not offer a female to the exporter.",
    source: SRC.femaleBan2019,
  });
  lines.push({
    id: "state_certificate",
    status: "info",
    ar: "شهادة صحّيّة من ولاية المنشأ",
    en: "Health certificate from the state of origin",
    detailAr: "لا يدخل حيوانٌ مركز التفتيش والتحقين إلّا بشهادةٍ صحّيّة معتمدة من ولايته وورقة المرور من المركز. اطلبها من البيطريّ الحكوميّ في ولايتك.",
    detailEn: "No animal enters an inspection and vaccination centre without a validated health certificate from its state and the centre's way form. Ask the government vet in your state.",
    source: SRC.quarantineAct2004,
  });
  lines.push({
    id: "exporter",
    status: "info",
    ar: "البيع لمصدّرٍ مسجَّل، والدفع مقدّماً أو باعتمادٍ مستنديّ",
    en: "Sell to a registered exporter; payment in advance or by sight letter of credit",
    detailAr: "بنك السودان: تصدير المواشي الحيّة كلّها بالدفع المقدّم أو الاعتماد المستنديّ «إطلاع» فقط. فالمربّي يبيع لمصدّرٍ مسجَّل، ولا يصدّر باسمه.",
    detailEn: "Central Bank of Sudan: all live-animal exports by advance payment or sight letter of credit only. The herder sells to a registered exporter rather than exporting in his own name.",
    source: SRC.cbos2024,
  });

  if (dest === "sa") {
    lines.push({
      id: "tags",
      status: present >= h.headCount ? "ok" : present > 0 ? "warn" : "missing",
      ar: "ترقيم كلّ رأس",
      en: "Every head numbered",
      detailAr: present >= h.headCount
        ? `كلّ رؤوس القطيع مرقَّمة في سجلّك (${present}).`
        : `مرقَّمٌ في سجلّك ${present} من ${h.headCount}. الشرط السعوديّ: «يجب ترقيم جميع المواشي المُعدّة للتصدير».`,
      detailEn: present >= h.headCount
        ? `Every head is numbered in your record (${present}).`
        : `${present} of ${h.headCount} numbered in your record. The Saudi condition: every animal prepared for export must be numbered.`,
      source: SRC.saudiGuide2026,
    });

    const rvf = vaccination(h.records, "rvf", h.headCount);
    const smith = !!rvf.record?.product && /smith/i.test(rvf.record.product);
    lines.push({
      id: "rvf",
      status: !rvf.record ? "missing" : rvf.whole && smith ? "ok" : "warn",
      ar: "تطعيم حمّى الوادي المتصدّع بلقاح Smith Burn",
      en: "Rift Valley fever vaccination with Smith Burn",
      detailAr: !rvf.record
        ? "لم يُسجَّل في قطيعك. الشرط السعوديّ لصادر السودان: لقاح Smith Burn من جنوب أفريقيا، ثمّ فحص المناعة في المحجر لكلّ رأس (٤٠٪ على الأقلّ)."
        : `مسجَّلٌ في ${rvf.record.done_on} لـ${rvf.record.heads} رأساً${smith ? "" : "، واسم اللقاح غير مكتوب أو ليس Smith Burn"}${rvf.whole ? "" : "، ولم يشمل كلّ القطيع"}. ويُفحص مستوى المناعة في المحجر.`,
      detailEn: !rvf.record
        ? "Not recorded for your herd. The Saudi condition for Sudan: Smith Burn vaccine from South Africa, then an immunity test on every head at the quarantine (at least 40%)."
        : `Recorded on ${rvf.record.done_on} for ${rvf.record.heads} head${smith ? "" : "; the vaccine name is missing or is not Smith Burn"}${rvf.whole ? "" : "; it did not cover the whole herd"}. Immunity is tested at the quarantine.`,
      source: SRC.saudiGuide2026,
    });

    if (small(h.species)) {
      for (const [key, ar, en] of [
        ["ppr", "طاعون المجترّات الصغيرة", "PPR"],
        ["sheep_goat_pox", "جدري الضأن والماعز", "sheep and goat pox"],
      ] as const) {
        const v = vaccination(h.records, key, h.headCount);
        lines.push({
          id: key,
          status: !v.record ? "missing" : v.whole ? "ok" : "warn",
          ar: `تطعيم ${ar}`,
          en: `${en} vaccination`,
          detailAr: !v.record
            ? `لم يُسجَّل. الشرط السعوديّ: حيث يوجد برنامجٌ وطنيّ للتحصين ضدّ ${ar} تُحصَّن المواشي ويُذكر ذلك في الشهادة الصحّيّة.`
            : `مسجَّلٌ في ${v.record.done_on} لـ${v.record.heads} رأساً${v.whole ? "" : "، ولم يشمل كلّ القطيع"}.`,
          detailEn: !v.record
            ? `Not recorded. The Saudi condition: where a national ${en} programme exists, the animals are vaccinated and it is stated on the health certificate.`
            : `Recorded on ${v.record.done_on} for ${v.record.heads} head${v.whole ? "" : "; it did not cover the whole herd"}.`,
          source: SRC.saudiGuide2026,
        });
      }
    }

    const spray = latestByItem(h.records.filter((x) => x.kind === "treatment")).get("external_parasites");
    lines.push({
      id: "spray",
      status: spray ? "ok" : "missing",
      ar: "رشٌّ ضدّ الطفيليّات الخارجيّة قبل المحجر",
      en: "Spray against external parasites before quarantine",
      detailAr: spray
        ? `مسجَّلٌ في ${spray.done_on}.`
        : "لم يُسجَّل. الشرط السعوديّ: رشّ المواشي بمبيداتٍ معتمدة دوليّاً قبل دخولها المحجر.",
      detailEn: spray
        ? `Recorded on ${spray.done_on}.`
        : "Not recorded. The Saudi condition: spray the animals with internationally approved pesticides before they enter quarantine.",
      source: SRC.saudiGuide2026,
    });

    lines.push({
      id: "region",
      status: h.stateDiseases === null ? "info" : h.stateDiseases.length > 0 ? "warn" : "ok",
      ar: "الجمع من منطقةٍ لم تُسجَّل فيها أمراض وبائيّة",
      en: "Collected from an area with no recorded epidemic disease",
      detailAr: h.stateDiseases === null
        ? "اربط القطيع بأرضه لنقارن ولايتها بما وصل إلى الفاو من أحداث."
        : h.stateDiseases.length > 0
          ? `وصل إلى الفاو في ولاية أرضك خلال آخر ٩٠ يوماً: ${h.stateDiseases.join("، ")}. اسأل البيطريّ الحكوميّ قبل التحرّك.`
          : "لم يصل إلى الفاو حدثٌ في ولاية أرضك خلال آخر ٩٠ يوماً. وما لم يُبلَّغ عنه لا يظهر.",
      detailEn: h.stateDiseases === null
        ? "Link the herd to its land so its state can be compared with what reached FAO."
        : h.stateDiseases.length > 0
          ? `Reached FAO for your land's state in the last 90 days: ${h.stateDiseases.join(", ")}. Ask the government vet before moving.`
          : "No event in your land's state reached FAO in the last 90 days. What was never reported does not show.",
      source: SRC.saudiGuide2026,
    });

    lines.push({
      id: "quarantine",
      status: "info",
      ar: "حجرٌ لا يقلّ عن ٢١ يوماً، وفحوصٌ في المحجر",
      en: "At least 21 days of quarantine, and tests at the quarantine",
      detailAr: "يبدأ الحجر بعد صدور إذن الاستيراد. وتُجرى في المحجر فحوص البروسيلا والحمّى القلاعيّة ومناعة الوادي المتصدّع لكلّ رأس واللسان الأزرق، وتُرفق نتائجها بالشهادة. والعلف والرعاية أثناء الحجر على صاحب الحيوان (قانون 2004، المادة 12).",
      detailEn: "Quarantine starts after the import permit is issued. Brucellosis, foot-and-mouth, Rift Valley fever immunity (every head) and bluetongue are tested there, and the results go with the certificate. Feed and care during quarantine are the owner's (2004 Act, s.12).",
      source: SRC.saudiGuide2026,
    });

    const kg = STANDARD_WEIGHT_KG[h.species];
    if (kg) {
      lines.push({
        id: "weight",
        status: "info",
        ar: `الوزن القياسيّ: ${kg} كيلوغراماً للرأس`,
        en: `Standard weight: ${kg} kg a head`,
        detailAr: "أوزان وزارة البيئة السعوديّة منذ مارس 2019 كما نشرتها الصحافة: الضأن السواكني ٣٥، والماعز ٢٠، والأبقار ٢٨٠، والإبل ٢٠٠ كيلوغرام. زِن عيّنةً قبل البيع.",
        detailEn: "The Saudi ministry's weights since March 2019 as the press reported them: Sawakni sheep 35, goats 20, cattle 280, camels 200 kg. Weigh a sample before selling.",
        source: SRC.mewaWeights2019,
      });
    }
  }

  if (dest === "eg") {
    if (h.species === "cattle") {
      lines.push({
        id: "slaughter_only",
        status: "info",
        ar: "الأبقار إلى مصر للذبح الفوريّ",
        en: "Cattle to Egypt are for immediate slaughter",
        detailAr: "تُذبح أبقار السودان في المجازر الحدوديّة داخل مصر، ولا تبقى حيّة.",
        detailEn: "Sudanese cattle are slaughtered at border abattoirs inside Egypt; they do not stay alive.",
        source: SRC.egyptCattle2024,
      });
    }

    if (h.species !== "camel") {
      const candidates = ["fmd", "cbpp", "anthrax"]
        .map((k) => vaccination(h.records, k, h.headCount).record)
        .filter((r): r is HealthRecord => !!r);
      const inWindow = candidates.find((r) => daysBetween(r.done_on, h.today) >= 21 && h.today <= addMonths(r.done_on, 3));
      const tooRecent = candidates.find((r) => daysBetween(r.done_on, h.today) < 21);
      lines.push({
        id: "eg_vaccine_window",
        status: inWindow ? "ok" : tooRecent ? "warn" : "missing",
        ar: "تطعيمٌ بين ٢١ يوماً وثلاثة أشهر قبل الوصول",
        en: "A vaccination 21 days to 3 months before arrival",
        detailAr: inWindow
          ? `مسجَّلٌ في ${inWindow.done_on}، داخل المدّة.`
          : tooRecent
            ? `مسجَّلٌ في ${tooRecent.done_on}، ولم تمضِ ٢١ يوماً بعد.`
            : "لا تطعيم مسجَّل ضدّ الحمّى القلاعيّة أو ذات الرئة البقريّ أو الجمرة الخبيثة في هذه المدّة. الشرط المصريّ لحيوانات الذبح من بلدٍ موبوء.",
        detailEn: inWindow
          ? `Recorded on ${inWindow.done_on}, inside the window.`
          : tooRecent
            ? `Recorded on ${tooRecent.done_on}; 21 days have not passed yet.`
            : "No vaccination against foot-and-mouth, bovine pleuropneumonia or anthrax recorded in that window. Egypt's condition for slaughter animals from an infected country.",
        source: SRC.egyptSlaughter,
      });
      lines.push({
        id: "eg_quarantine",
        status: "info",
        ar: "حجرٌ في السودان قبل الشحن، وفحص الحمّى القلاعيّة",
        en: "Quarantine in Sudan before shipment, and a foot-and-mouth test",
        detailAr: "تقريرٌ أمريكيّ (2022): ٢١ يوماً في السودان تحت إشراف البيطريّ المصريّ، ثمّ ٢٨ يوماً عند الوصول. والمصادر تختلف في المدّة، فاسأل المصدّر عن المعمول به الآن.",
        detailEn: "A US report (2022): 21 days in Sudan under the Egyptian vet's supervision, then 28 days on arrival. Sources differ on the length, so ask the exporter what applies now.",
        source: SRC.egyptQuarantine,
      });
    } else {
      lines.push({
        id: "eg_camels",
        status: "info",
        ar: "الإبل: عيّنةٌ لكلّ رأس ضدّ الوادي المتصدّع وحجرٌ عند الوصول",
        en: "Camels: every head sampled for Rift Valley fever and quarantined on arrival",
        detailAr: "في الشلاتين (2023): عيّنةٌ من كلّ الإبل لحمّى الوادي المتصدّع، وحجر ١٤ يوماً. وبعد الحجر يجوز أن تذهب للأسواق.",
        detailEn: "At Shalateen (2023): every camel sampled for Rift Valley fever and quarantined 14 days. After quarantine they may go to markets.",
        source: SRC.egyptCamels2023,
      });
    }
  }

  return lines;
}

/** «مستوفٍ لقائمة التحضير» when nothing the record can answer is missing — never «جاهز للتصدير». */
export function checklistVerdict(lines: CheckLine[]): { met: boolean; missing: number; warn: number } {
  const missing = lines.filter((l) => l.status === "missing").length;
  const warn = lines.filter((l) => l.status === "warn").length;
  return { met: missing === 0 && warn === 0, missing, warn };
}

export const SOURCE_KIND_LABEL: Record<SourceKind, { ar: string; en: string }> = {
  official: { ar: "رسميّ", en: "official" },
  news: { ar: "خبر صحفيّ", en: "news report" },
  research: { ar: "تقرير بحثيّ", en: "research report" },
};
