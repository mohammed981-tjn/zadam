import Link from "next/link";
import {
  HEADLINE,
  COMMODITIES,
  BASKET_SOURCE,
  BEYOND,
  GATES,
  DEADLINES,
  LIMITS,
  MONEY_KNOT,
  REJECTION,
  HEADLINE_EN,
  COMMODITIES_EN,
  BEYOND_EN,
  GATES_EN,
  DEADLINES_EN,
  LIMITS_EN,
  MONEY_KNOT_EN,
  REJECTION_EN,
  type Source,
} from "@/lib/exportTrade";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import FilmPlayer from "@/components/FilmPlayer";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(
      locale,
      "ممرّ الصادر السوداني — دراسة سوداقري | سوداقري",
      "Sudan's export corridor — a Sudagri study | Sudagri",
    ),
    description: tr(
      locale,
      "أبوابُ العالم مفتوحةٌ أمام صادرات السودان بلا رسوم، والشحنات تُردّ. دراسةٌ في البوّابات الأربع التي تمرّ بها كل شحنة — المنشأ والصحّة والمطابقة والمال — وفي اللوائح الأوروبية القادمة ومواعيدها.",
      "The world's doors are open to Sudan's exports duty-free, and shipments are still turned back. A study of the four gates every shipment passes through — origin, health, conformity and money — and of the coming European regulations and their deadlines.",
    ),
  };
}

/**
 * Sudan's export trade, as read from published sources.
 *
 * WHY THIS PAGE IS NOT LIKE THE CANAL STUDY
 *
 * The canal page is our arithmetic: elevations we sampled, a water requirement
 * we computed, a cost we built from quantities and rates. It says so, and it
 * signs its numbers.
 *
 * This page signs none. Every figure on it was read from somebody else — the
 * European Commission, the central bank, a border-rejection study, trade data —
 * and each one renders with the source it came from, one click away. A reader
 * should never have to guess which kind of page they are on, and mixing the two
 * would make both untrustworthy.
 *
 * The figures live in lib/exportTrade.ts rather than in the paragraphs here, so
 * that a tariff arrangement or a regulation date is one line to update and no
 * two sentences on the site can disagree about it.
 *
 * WHAT IS DELIBERATELY LEFT OUT
 *
 * The study this page is drawn from also covered what the platform should build
 * in response, and how. That belongs in the repository, not on a public page:
 * a reader here is a farmer, an exporter or a buyer, and what they need is the
 * shape of the gates they have to pass — not our engineering plan.
 */

function Cite({ source, locale }: { source: Source; locale: Locale }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
    >
      {locale === "en" ? `Source: ${source.labelEn}` : `المصدر: ${source.label}`} ↗
    </a>
  );
}

export default async function ExportPage() {
  const locale = await getLocale();
  const en = locale === "en";
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const headline = en ? HEADLINE_EN : HEADLINE;
  const commodities = en ? COMMODITIES_EN : COMMODITIES;
  const beyond = en ? BEYOND_EN : BEYOND;
  const gates = en ? GATES_EN : GATES;
  const deadlines = en ? DEADLINES_EN : DEADLINES;
  const limits = en ? LIMITS_EN : LIMITS;
  const moneyKnot = en ? MONEY_KNOT_EN : MONEY_KNOT;
  const rejection = en ? REJECTION_EN : REJECTION;

  return (
    <main className="mx-auto max-w-4xl space-y-14 px-4 py-10 lg:max-w-5xl">
      <header className="space-y-4">
        <p className="text-xs tracking-widest text-emerald-700">{t("دراسة · سبتمبر 2026", "Study · September 2026")}</p>
        <h1 className="text-3xl font-bold sm:text-4xl">{t("ممرّ الصادر السوداني", "Sudan's export corridor")}</h1>
        {en ? (
          <p className="border-s-4 border-amber-500 ps-4 text-lg leading-relaxed text-gray-700">
            The world&apos;s doors are open to Sudan duty-free. And shipments
            are turned back. The difference is not the market or customs — it
            is <strong>proof</strong>.
          </p>
        ) : (
          <p className="border-s-4 border-amber-500 ps-4 text-lg leading-relaxed text-gray-700">
            أبوابُ العالم مفتوحةٌ أمام السودان بلا رسوم. والشحنات تُردّ.
            الفارقُ ليس السوق ولا الجمارك — بل <strong>الإثبات</strong>.
          </p>
        )}
        <ShareWhatsApp
          path="/export"
          text={t(
            "ممرّ الصادر السوداني — البوّابات الأربع لكل شحنة:",
            "Sudan's export corridor — the four gates of every shipment:",
          )}
          className="my-3"
          locale={locale}
        />

      <figure className="my-6">
        <FilmPlayer base="/video/export-wide" poster="/video/export-wide.jpg" label={t("فيلم سوداقري: من حقول السودان إلى أسواق العالم", "Sudagri film: from Sudan's fields to the world's markets")} />
      </figure>
      </header>

      <section className="grid gap-px overflow-hidden rounded-lg border bg-gray-200 sm:grid-cols-2">
        {headline.map((f) => (
          <div key={f.label} className="space-y-1 bg-white p-4">
            <div className="text-2xl font-bold text-amber-700">{f.value}</div>
            <div className="text-sm font-medium">{f.label}</div>
            {f.note && <p className="text-sm text-gray-600">{f.note}</p>}
            <Cite source={f.source} locale={locale} />
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">
          {t("المفارقة: بابٌ مفتوح وشحنةٌ ترتدّ", "The paradox: an open door and shipments turned back")}
        </h2>
        {en ? (
          <p className="leading-relaxed text-gray-700">
            It is often assumed that the obstacle to Sudan&apos;s exports is
            tariffs or bans. It is not. The “Everything But Arms” arrangement
            gives the least developed countries — Sudan among them — duty-free,
            quota-free access for every product except arms. In the new
            preferences regulation in force from 1 January 2027, this
            arrangement alone kept <strong>no end date</strong>, while the
            others were set to run until 2036.
          </p>
        ) : (
          <p className="leading-relaxed text-gray-700">
            يُظنّ أن عائق الصادر السوداني هو الرسوم أو الحظر. ليس كذلك. ترتيب
            «كل شيء عدا السلاح» يمنح أقلَّ البلدان نمواً — والسودان منها — دخولاً
            بلا رسومٍ وبلا حصص لكل المنتجات عدا الأسلحة. وفي لائحة الأفضليات
            الجديدة السارية من أول يناير 2027، بقي هذا الترتيب وحده{" "}
            <strong>بلا تاريخ انتهاء</strong> بينما حُدِّدت البقيةُ حتى 2036.
          </p>
        )}
        <p className="leading-relaxed text-gray-700">
          {t("ومع ذلك تُردّ الشحنات:", "And yet shipments are turned back:")}
        </p>
        <ul className="list-disc space-y-2 ps-6 text-gray-700">
          {rejection.points.map((p) => (
            <li key={p} className="leading-relaxed">{p}</li>
          ))}
        </ul>
        <Cite source={rejection.source} locale={locale} />
        <div className="rounded-lg border-s-4 border-amber-500 bg-amber-50 p-4">
          {en ? (
            <p className="leading-relaxed">
              When duties are zero and rejections continue, the constraint is
              not commercial but <strong>evidentiary</strong>. And an
              evidentiary constraint — unlike tariffs and quotas — is a matter
              of linked, time-stamped, preserved records, not of negotiation
              between states.
            </p>
          ) : (
            <p className="leading-relaxed">
              حين تكون الرسوم صفراً ويبقى الرفض قائماً، فالقيدُ ليس تجارياً بل{" "}
              <strong>إثباتيّ</strong>. والقيد الإثباتي — على خلاف الرسوم والحصص —
              مسألةُ سجلّاتٍ مرتبطةٍ ومُوقَّتةٍ ومحفوظة، لا مسألةَ تفاوضٍ بين دول.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">{t("ما يبيعه السودان", "What Sudan sells")}</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="bg-gray-50 text-start">
              <tr>
                <th className="p-3 font-medium">{t("السلعة", "Commodity")}</th>
                <th className="p-3 font-medium">{t("الحصّة", "Share")}</th>
                <th className="p-3 font-medium">{t("السوق", "Market")}</th>
                <th className="p-3 font-medium">{t("ما يحكم قبولها", "What decides acceptance")}</th>
              </tr>
            </thead>
            <tbody>
              {commodities.map((c) => (
                <tr key={c.name} className="border-t align-top">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3 tabular-nums whitespace-nowrap">{c.share ?? "—"}</td>
                  <td className="p-3 text-gray-600">{c.markets}</td>
                  <td className="p-3 text-gray-600">{c.gate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Cite source={BASKET_SOURCE} locale={locale} />
        {en ? (
          <p className="leading-relaxed text-gray-700">
            And beyond these: {beyond.join(" · ")}. All of them pass through the
            same gates — whoever gets through them for one commodity gets
            through for the rest.
          </p>
        ) : (
          <p className="leading-relaxed text-gray-700">
            وما وراء هذه: {beyond.join(" · ")}. وكلُّها تمرّ من البوّابات نفسها —
            فمن يجتازها لسلعةٍ يجتازها لبقيّتها.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">{t("البوّابات الأربع", "The four gates")}</h2>
        <p className="leading-relaxed text-gray-700">
          {t(
            "كل شحنةٍ مغادرة تمرّ بأربع بوّاباتٍ مستقلّة. وتعطّلُ واحدةٍ يوقف الصفقة كلَّها مهما سلمت البقية — ولذلك يُستعدّ لأربعتها معاً لا لأسهلها.",
            "Every outgoing shipment passes four independent gates. A failure at any one stops the whole deal however sound the rest are — so you prepare for all four together, not just the easiest.",
          )}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {gates.map((g) => (
            <article key={g.title} className="flex flex-col gap-2 rounded-lg border p-4">
              <span className="text-xs tracking-widest text-emerald-700">{g.n}</span>
              <h3 className="text-xl font-bold">{g.title}</h3>
              {g.body.map((p) => (
                <p key={p} className="text-sm leading-relaxed text-gray-700">{p}</p>
              ))}
              <p className="mt-auto border-t pt-2 text-xs text-gray-500">
                {t("من يحملها:", "Who holds it:")} {g.holder}
              </p>
              <Cite source={g.source} locale={locale} />
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">
          {t("العقدة المالية — ولماذا الإثبات يساوي سعراً", "The money knot — and why proof is worth a price")}
        </h2>
        {moneyKnot.paragraphs.map((p) => (
          <p key={p} className="leading-relaxed text-gray-700">{p}</p>
        ))}
        <Cite source={moneyKnot.source} locale={locale} />
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">
          {t("نافذةٌ تُغلق: اللوائح القادمة", "A closing window: the coming regulations")}
        </h2>
        <p className="leading-relaxed text-gray-700">
          {t(
            "ما يجعل هذا التوقيت مختلفاً عن أي سنةٍ مضت هو أن أوروبا تنقل عبء الإثبات من الجمرك إلى المورِّد، بمواعيدَ محدَّدة:",
            "What makes this moment different from any past year is that Europe is moving the burden of proof from customs to the supplier, on fixed dates:",
          )}
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[38rem] text-sm">
            <thead className="bg-gray-50 text-start">
              <tr>
                <th className="p-3 font-medium">{t("الالتزام", "Obligation")}</th>
                <th className="p-3 font-medium">{t("يسري", "In force")}</th>
                <th className="p-3 font-medium">{t("ما يطلبه", "What it asks")}</th>
                <th className="p-3 font-medium">{t("أثره", "Effect")}</th>
              </tr>
            </thead>
            <tbody>
              {deadlines.map((d) => (
                <tr key={d.what} className="border-t align-top">
                  <td className="p-3 font-medium">{d.what}</td>
                  <td className="p-3 whitespace-nowrap tabular-nums">{d.when}</td>
                  <td className="p-3 text-gray-600">{d.asks}</td>
                  <td className="p-3 text-gray-600">{d.effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Cite source={deadlines[0].source} locale={locale} />
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">{t("ماذا يعني هذا لمن ينتج", "What this means for producers")}</h2>
        {en ? (
          <p className="leading-relaxed text-gray-700">
            That what is asked of you is not better goods but a{" "}
            <strong>clearer record</strong>: where they came from, when, at
            which coordinates, who witnessed it, and with which paper they
            travel. All of these are recorded at the time of the work or never
            — a photo of a stage not taken at the time cannot be made after the
            harvest.
          </p>
        ) : (
          <p className="leading-relaxed text-gray-700">
            أن ما يُطلب منك ليس بضاعةً أفضل، بل <strong>سجلّاً أوضح</strong>: من
            أين جاءت، ومتى، وبأيّ إحداثيّة، ومن شهد عليها، وبأيّ ورقةٍ تسافر. وهذه
            كلُّها أشياء تُسجَّل وقت العمل أو لا تُسجَّل أبداً — فصورةُ مرحلةٍ لم
            تُلتقط في حينها لا تُصنع بعد الحصاد.
          </p>
        )}
        <p className="leading-relaxed text-gray-700">
          {t(
            "وسوداقري تبني هذا الجانب: سجلُّ الموسم بمراحله وأدلّته المصوّرة بإحداثيّاتها وتواريخها، وسجلُّ إثبات المنشأ للتعدين بسلسلة عهدةٍ لا تقبل التعديل، وتوثيقُ مقدّمي الخدمة. ونشرُ سجلّك يبقى قرارك وحدك — لا يُنشر شيءٌ عنك إلا بإذنك.",
            "Sudagri is building this side: a season record with its stages and photo evidence, with coordinates and dates; an origin registry for mining with a chain of custody that cannot be altered; and verification of service providers. Publishing your record stays your decision alone — nothing about you is published without your permission.",
          )}
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/seasons" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-800">
            {t("سجّل موسمك", "Record your season")}
          </Link>
          <Link href="/mining/registry" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">
            {t("سجلّ إثبات المنشأ", "Origin registry")}
          </Link>
          <Link href="/guide" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">
            {t("دليل الاستخدام", "User guide")}
          </Link>
        </div>
      </section>

      <section className="space-y-4 border-t pt-8">
        <h2 className="text-xl font-bold">{t("حدود هذه الدراسة", "Limits of this study")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {limits.map((l) => (
            <div key={l.title} className="space-y-2 rounded-lg bg-gray-50 p-4">
              <h3 className="text-sm font-bold">{l.title}</h3>
              <p className="text-sm leading-relaxed text-gray-600">{l.body}</p>
              <Cite source={l.source} locale={locale} />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
