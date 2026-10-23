import { tr, type Locale } from "@/lib/i18n";
import type { InvestorModel } from "@/lib/investors";
import { waterSourceLabel } from "@/lib/farmLabelsEn";

/**
 * عقد الشراكة بين المستثمر وصاحب الأرض (البند ١٢٧).
 *
 * The database is the boundary (supabase/migrations/20261021230000_
 * partnership_agreements.sql, partnership_terms_check): every list here
 * mirrors what it accepts, so the form cannot offer what it would refuse.
 *
 * The contract's text is built here from the stored terms — the same terms the
 * hash is computed over — so what a party reads is what they sign.
 */

export const AGREEMENT_ITEMS = [
  "land",
  "water",
  "labour",
  "ploughing",
  "seed",
  "fertiliser",
  "pesticide",
  "fuel",
  "irrigation",
  "harvest",
  "transport",
  "storage",
  // An orchard's (musaqah, backlog 136): the standing trees are the owner's,
  // and their pruning and pollination are work a sown field does not have.
  "trees",
  "pruning",
] as const;
export type AgreementItem = (typeof AGREEMENT_ITEMS)[number];

export const ITEM_LABEL: Record<AgreementItem, { ar: string; en: string }> = {
  land: { ar: "الأرض", en: "The land" },
  water: { ar: "الماء", en: "Water" },
  labour: { ar: "العمل اليومي والعمّال", en: "Daily work and labour" },
  ploughing: { ar: "الحرث وتجهيز الأرض", en: "Ploughing and land preparation" },
  seed: { ar: "البذور والتقاوي", en: "Seed" },
  fertiliser: { ar: "السماد", en: "Fertiliser" },
  pesticide: { ar: "المبيدات", en: "Pesticides" },
  fuel: { ar: "الوقود", en: "Fuel" },
  irrigation: { ar: "الريّ وتشغيل المضخّة", en: "Irrigation and running the pump" },
  harvest: { ar: "الحصاد", en: "Harvest" },
  transport: { ar: "الترحيل", en: "Transport" },
  storage: { ar: "التخزين", en: "Storage" },
  trees: { ar: "الشجر والنخيل القائم", en: "The standing trees and palms" },
  pruning: { ar: "التقليم والتلقيح", en: "Pruning and pollination" },
};

export const LOSS_RULES = ["by_contribution", "investor_inputs", "custom"] as const;
export type LossRule = (typeof LOSS_RULES)[number];

export const LOSS_RULE_LABEL: Record<LossRule, { ar: string; en: string }> = {
  by_contribution: {
    ar: "إن خسر الموسم يتحمّل كلٌّ ما قدّمه: صاحب الأرض أرضه وعمله، والمستثمر ما دفعه — ولا يضمن أحدٌ للآخر شيئاً إلّا بتعدٍّ أو تقصير.",
    en: "If the season loses, each bears what they put in: the owner the land and the work, the investor what they paid — neither guarantees the other anything, except for misconduct or negligence.",
  },
  investor_inputs: {
    ar: "يُقسم ما خرج من المحصول بالحصص المذكورة مهما قلّ، ويتحمّل المستثمر ما زاد من تكلفة المدخلات على نصيبه، ولا يُطالَب صاحب الأرض بشيءٍ منها.",
    en: "Whatever the harvest yields is split by the stated shares however small; the investor bears any input cost beyond their share, and the owner owes none of it.",
  },
  custom: { ar: "اتّفقنا على حكمٍ آخر نكتبه:", en: "We agreed another rule, written here:" },
};

export const RENT_SCHEDULES = ["upfront", "two_parts", "after_harvest"] as const;
export type RentSchedule = (typeof RENT_SCHEDULES)[number];

export const RENT_SCHEDULE_LABEL: Record<RentSchedule, { ar: string; en: string }> = {
  upfront: { ar: "تُدفع كاملةً عند بداية العقد", en: "Paid in full when the agreement starts" },
  two_parts: { ar: "نصفها عند البداية ونصفها عند الحصاد", en: "Half at the start, half at harvest" },
  after_harvest: { ar: "تُدفع كاملةً بعد الحصاد", en: "Paid in full after harvest" },
};

export interface AgreementTerms {
  crop?: string;
  season?: string;
  start_date?: string;
  end_date?: string;
  feddans?: number;
  owner_provides?: AgreementItem[];
  investor_provides?: AgreementItem[];
  owner_share?: number;
  investor_share?: number;
  rent_amount?: number;
  rent_schedule?: RentSchedule;
  finance_amount?: number;
  currency?: "SDG" | "USD";
  loss_rule?: LossRule;
  loss_text?: string;
  extra?: string;
}

export interface AgreementSignature {
  role: "owner" | "investor";
  full_name: string;
  signature: string;
  signed_at: string;
  version: number;
}

/** partnership_agreement_view() */
export interface AgreementView {
  id: string;
  ref: string | null;
  model: InvestorModel;
  terms: AgreementTerms;
  version: number;
  terms_hash: string;
  status: "draft" | "signed";
  signed_at: string | null;
  updated_at: string;
  created_at: string;
  me: "owner" | "investor" | "admin";
  owner_name: string | null;
  investor_name: string | null;
  land: {
    name: string;
    state: string;
    locality: string | null;
    village: string | null;
    feddans: number;
    water_source: string;
    documents_on_file: number;
  };
  signatures: AgreementSignature[];
  earlier_signatures: number;
}

export const AGREEMENT_TITLE: Record<InvestorModel, { ar: string; en: string }> = {
  sharecrop: { ar: "عقد مزارعة (مشاركة بالمحصول)", en: "Crop-sharing agreement (muzara'a)" },
  lease: { ar: "عقد إيجار أرضٍ زراعيّة", en: "Farmland lease agreement" },
  finance: { ar: "عقد تمويل مدخلاتٍ زراعيّة مقابل حصّة", en: "Input-finance agreement for a share" },
  musaqah: { ar: "عقد مساقاة (رعاية البستان بحصّةٍ من الثمر)", en: "Musaqah agreement (tending an orchard for a share of the fruit)" },
};

const n = (v: number | undefined, locale: Locale) =>
  v === undefined || v === null ? "—" : Number(v).toLocaleString(locale === "en" ? "en-US" : "ar-EG");

const day = (d: string | undefined, locale: Locale) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString(locale === "en" ? "en-GB" : "ar-EG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—";

const money = (v: number | undefined, c: string | undefined, locale: Locale) =>
  `${n(v, locale)} ${c === "USD" ? tr(locale, "دولار أمريكي", "US dollars") : tr(locale, "جنيه سوداني", "Sudanese pounds")}`;

/** The contract as numbered clauses, in the reader's language, from the stored terms. */
export function agreementClauses(a: AgreementView, locale: Locale): { title: string; body: string[] }[] {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const x = a.terms;
  const list = (items: AgreementItem[] | undefined) =>
    items && items.length ? items.map((i) => tr(locale, ITEM_LABEL[i].ar, ITEM_LABEL[i].en)).join(t("، ", ", ")) : t("لا شيء", "nothing");
  const place = [a.land.state, a.land.locality, a.land.village].filter(Boolean).join(t(" · ", " · "));

  const clauses: { title: string; body: string[] }[] = [
    {
      title: t("الطرفان", "The parties"),
      body: [
        `${t("الطرف الأول، صاحب الأرض:", "First party, the landowner:")} ${a.owner_name ?? "—"}`,
        `${t("الطرف الثاني، المستثمر:", "Second party, the investor:")} ${a.investor_name ?? "—"}`,
      ],
    },
    {
      title: t("الأرض", "The land"),
      body: [
        `${a.land.name} — ${place}`,
        t(
          `المساحة المشمولة بالعقد ${n(x.feddans, locale)} فدان من ${n(a.land.feddans, locale)} فدان، ومصدر مائها: ${waterSourceLabel(a.land.water_source, locale)}.`,
          `This agreement covers ${n(x.feddans, locale)} of the land's ${n(a.land.feddans, locale)} feddans; its water source: ${waterSourceLabel(a.land.water_source, locale)}.`,
        ),
        t(
          "راجعت إدارة سوداقري مستندات الأرض ووثّقتها قبل عرضها. وتشهد بوجود المستندات ومطابقتها لما تقوله الأرض، لا بصحّة الملكيّة أمام القضاء.",
          "Sudagri's administrators reviewed and verified the land's documents before it was offered. That vouches for the documents existing and matching the land, not for ownership before a court.",
        ),
      ],
    },
    {
      title: t("المحصول والمدّة", "Crop and term"),
      body: [
        t(
          `يُزرع: ${x.crop ?? "—"}، في ${x.season ?? "—"}، من ${day(x.start_date, locale)} إلى ${day(x.end_date, locale)}.`,
          `Crop: ${x.crop ?? "—"}, in ${x.season ?? "—"}, from ${day(x.start_date, locale)} to ${day(x.end_date, locale)}.`,
        ),
      ],
    },
    {
      title: t("ما يقدّمه كلّ طرف", "What each party provides"),
      body: [
        `${t("صاحب الأرض:", "The landowner:")} ${list(x.owner_provides)}.`,
        `${t("المستثمر:", "The investor:")} ${list(x.investor_provides)}.`,
      ],
    },
  ];

  if (a.model === "sharecrop") {
    clauses.push({
      title: t("قسمة المحصول", "Sharing the harvest"),
      body: [
        t(
          `يُقسم المحصول بعد الحصاد: لصاحب الأرض ${n(x.owner_share, locale)}٪، وللمستثمر ${n(x.investor_share, locale)}٪.`,
          `After harvest the crop is split: ${n(x.owner_share, locale)}% to the landowner, ${n(x.investor_share, locale)}% to the investor.`,
        ),
        t(
          "والحصّة نسبةٌ شائعة ممّا يخرج من الأرض، لا كمّيّةٌ ثابتة يُضمن قدرها.",
          "Each share is a proportion of whatever the land yields, never a fixed quantity guaranteed in advance.",
        ),
      ],
    });
  }
  if (a.model === "lease") {
    clauses.push({
      title: t("الأجرة", "Rent"),
      body: [
        t(
          `يدفع المستثمر لصاحب الأرض أجرةً قدرها ${money(x.rent_amount, x.currency, locale)} عن المدّة كلّها.`,
          `The investor pays the landowner a rent of ${money(x.rent_amount, x.currency, locale)} for the whole term.`,
        ),
        x.rent_schedule ? tr(locale, RENT_SCHEDULE_LABEL[x.rent_schedule].ar, RENT_SCHEDULE_LABEL[x.rent_schedule].en) + t(".", ".") : "—",
        t(
          "والمحصول كلّه للمستثمر. وإن تعذّرت الزراعة لسببٍ لا يد له فيه، أو هلك الزرع قبل حصاده، فحكم الأجرة ما يقرّره قانون المعاملات المدنيّة لسنة ١٩٨٤ (المادّة ٣٢٨)، ما لم يُكتب غير ذلك في الشروط الإضافيّة.",
          "The whole crop is the investor's. If farming becomes impossible for a cause outside the investor's control, or the crop is destroyed before harvest, the rent follows the Civil Transactions Act 1984 (article 328), unless the additional terms say otherwise.",
        ),
      ],
    });
  }
  if (a.model === "finance") {
    clauses.push({
      title: t("التمويل والحصّة", "Finance and share"),
      body: [
        t(
          `يموّل المستثمر المدخلات المذكورة بما لا يتجاوز ${money(x.finance_amount, x.currency, locale)}، ويدفع ثمنها مباشرةً للمورّد أو الشركة المنفّذة، ويزرع صاحب الأرض أرضه بنفسه.`,
          `The investor finances the inputs listed, up to ${money(x.finance_amount, x.currency, locale)}, paying the supplier or service company directly; the landowner farms the land.`,
        ),
        t(
          `ويُقسم المحصول بعد الحصاد: لصاحب الأرض ${n(x.owner_share, locale)}٪، وللمستثمر ${n(x.investor_share, locale)}٪ — نسبةٌ شائعة لا كمّيّة ثابتة.`,
          `After harvest the crop is split: ${n(x.owner_share, locale)}% to the landowner, ${n(x.investor_share, locale)}% to the investor — a proportion, never a fixed quantity.`,
        ),
      ],
    });
  }

  if (a.model === "musaqah") {
    clauses.push({
      title: t("رعاية الشجر وقسمة الثمر", "Tending the trees and sharing the fruit"),
      body: [
        t(
          "يرعى المستثمرُ الشجرَ والنخيل القائم في الأرض المذكورة بما تحتاجه: السقي والتقليم والتلقيح والمكافحة والجني، بنفسه أو بمن يستعين به، وما بقي من أعمال الرعاية فعلى من كُتب عليه أعلاه.",
          "The investor tends the standing trees and palms on the land described with what they need — watering, pruning, pollination, pest control, picking — directly or through those he engages; any other care falls on whoever is named for it above.",
        ),
        t(
          `ويُقسم الثمر بعد جنيه: لصاحب الأرض ${n(x.owner_share, locale)}٪، وللمستثمر ${n(x.investor_share, locale)}٪ — نسبةٌ شائعة ممّا يُثمره الشجر، لا كمّيّة ثابتة.`,
          `The fruit is split after picking: ${n(x.owner_share, locale)}% to the landowner, ${n(x.investor_share, locale)}% to the investor — a proportion of what the trees bear, never a fixed quantity.`,
        ),
        t(
          "وإن لم يُثمر الشجر فلا شيء لأحدهما على الآخر، والشجر لصاحبه على كلّ حال، لا يُقطع منه شيءٌ ولا يُغرس فيه جديدٌ إلّا بموافقته كتابةً (قانون المعاملات المدنيّة لسنة ١٩٨٤، المواد ٣٣٧–٣٤٧).",
          "If the trees bear nothing, neither owes the other anything; the trees remain the owner's in every case, and none is cut nor new planted without his written consent (Civil Transactions Act 1984, articles 337–347).",
        ),
      ],
    });
  }

  clauses.push({
    title: t("إن خسر الموسم", "If the season loses"),
    body: [
      x.loss_rule ? tr(locale, LOSS_RULE_LABEL[x.loss_rule].ar, LOSS_RULE_LABEL[x.loss_rule].en) : "—",
      ...(x.loss_rule === "custom" && x.loss_text ? [x.loss_text] : []),
    ],
  });
  if (a.model !== "lease") {
    clauses.push({
      title: t("الحصاد والقسمة", "Harvest and division"),
      body: [
        t(
          "يُخطر من يزرعُ الطرفَ الآخر بموعد الحصاد قبله بوقتٍ كافٍ، ويُوزن المحصول بحضورهما أو بحضور مشرفٍ من سوداقري أو من شركةٍ شريكة، ثمّ يُقسم. ويُخرج كلٌّ زكاة نصيبه.",
          "Whoever farms gives the other party enough notice of the harvest date; the crop is weighed in front of both, or of a supervisor from Sudagri or a partner company, then divided. Each pays the zakat on their own share.",
        ),
      ],
    });
  }
  clauses.push({
    title: t("الأرض والعقد", "The land and the agreement"),
    body: [
      t(
        "تُسلَّم الأرض صالحةً للزراعة بطريقها وحقّها في الماء، وتُردّ في نهاية العقد بحالٍ حسنة، ولا تُغيَّر مجاري الماء ولا يُقطع شجرها إلّا بموافقة صاحبها كتابةً.",
        "The land is handed over fit to farm, with its access and water rights, and returned in good condition at the end; no watercourse is changed and no tree cut without the owner's written consent.",
      ),
      t(
        "لا يتنازل أيٌّ من الطرفين عن العقد لغيره إلّا بموافقة الآخر كتابةً. وإن تُوفّي أحدهما قبل الحصاد أكمل ورثته الموسم على هذا العقد.",
        "Neither party assigns the agreement to anyone else without the other's written consent. If either dies before harvest, their heirs complete the season under this agreement.",
      ),
    ],
  });
  clauses.push({
    title: t("المتابعة والتقارير", "Follow-up and reports"),
    body: [
      t(
        "تُسجَّل مراحل الموسم في سوداقري بتقارير مصوّرة يراها الطرفان، ولكلٍّ منهما أن يطلب إشراف سوداقري أو شركةٍ شريكة موثّقة بأجرٍ يُتّفق عليه.",
        "The season's stages are recorded in Sudagri with photo reports both parties can see; either may ask for Sudagri's supervision or a verified partner company's, for an agreed fee.",
      ),
    ],
  });
  clauses.push({
    title: t("الدفع", "Payment"),
    body: [
      t(
        "يدفع كلُّ طرفٍ للآخر مباشرةً. لا تمسك سوداقري مالاً لأيٍّ منهما، ولا تضمن ربحاً ولا عائداً.",
        "Each party pays the other directly. Sudagri holds no money for either and guarantees no profit or return.",
      ),
    ],
  });
  clauses.push({
    title: t("الخلاف", "Disputes"),
    body: [
      t(
        "يُحلّ أيّ خلافٍ ودّيّاً أوّلاً، ثمّ بالجوديّة عبر سوداقري، ثمّ أمام المحكمة المختصّة في السودان.",
        "Any dispute is settled amicably first, then by judiyya mediation through Sudagri, then before the competent court in Sudan.",
      ),
    ],
  });
  if (x.extra && x.extra.trim()) {
    clauses.push({ title: t("شروطٌ إضافيّة", "Additional terms"), body: [x.extra] });
  }
  clauses.push({
    title: t("الحفظ والشهادة", "Keeping and witness"),
    body: [
      t(
        "يُحفظ هذا العقد في سوداقري، ويطّلع عليه الطرفان من هذه الصفحة متى شاءا. وإن احتاج أحدهما نسخةً لجهةٍ رسميّة طلبها من سوداقري فتُصدرها مختومة.",
        "This agreement is kept in Sudagri, and both parties can read it on this page at any time. If either needs a copy for an official body, Sudagri issues a stamped one on request.",
      ),
      t(
        "وتشهد سوداقري بأنّ الطرفين وقّعا هذه النسخة بحسابيهما في الوقت المذكور، وبصمتها مكتوبةٌ أسفلها: أيّ تغييرٍ في حرفٍ منها يغيّر البصمة.",
        "Sudagri witnesses that both parties signed this version from their own accounts at the time shown; its fingerprint is printed below — changing a single letter changes it.",
      ),
      t(
        "رسم كتابة العقد وتوثيقه يدفعه الطرفان مناصفة — وهو مجّانيٌّ في فترة التجربة.",
        "The fee for drafting and documenting the agreement is shared equally by both parties — free during the trial period.",
      ),
    ],
  });
  return clauses;
}
