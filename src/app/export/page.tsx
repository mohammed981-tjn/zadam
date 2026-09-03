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
  type Source,
} from "@/lib/exportTrade";

export const metadata = {
  title: "ممرّ الصادر السوداني — دراسة سودجري | سودجري",
  description:
    "أبوابُ العالم مفتوحةٌ أمام صادرات السودان بلا رسوم، والشحنات تُردّ. دراسةٌ في البوّابات الأربع التي تمرّ بها كل شحنة — المنشأ والصحّة والمطابقة والمال — وفي اللوائح الأوروبية القادمة ومواعيدها.",
};

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

function Cite({ source }: { source: Source }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
    >
      المصدر: {source.label} ↗
    </a>
  );
}

export default function ExportPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-14">
      <header className="space-y-4">
        <p className="text-xs tracking-widest text-emerald-700">دراسة · سبتمبر 2026</p>
        <h1 className="text-3xl font-bold sm:text-4xl">ممرّ الصادر السوداني</h1>
        <p className="border-r-4 border-amber-500 pr-4 text-lg leading-relaxed text-gray-700">
          أبوابُ العالم مفتوحةٌ أمام السودان بلا رسوم. والشحنات تُردّ.
          الفارقُ ليس السوق ولا الجمارك — بل <strong>الإثبات</strong>.
        </p>
      </header>

      <section className="grid gap-px overflow-hidden rounded-lg border bg-gray-200 sm:grid-cols-2">
        {HEADLINE.map((f) => (
          <div key={f.label} className="space-y-1 bg-white p-4">
            <div className="text-2xl font-bold text-amber-700">{f.value}</div>
            <div className="text-sm font-medium">{f.label}</div>
            {f.note && <p className="text-sm text-gray-600">{f.note}</p>}
            <Cite source={f.source} />
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">المفارقة: بابٌ مفتوح وشحنةٌ ترتدّ</h2>
        <p className="leading-relaxed text-gray-700">
          يُظنّ أن عائق الصادر السوداني هو الرسوم أو الحظر. ليس كذلك. ترتيب
          «كل شيء عدا السلاح» يمنح أقلَّ البلدان نمواً — والسودان منها — دخولاً
          بلا رسومٍ وبلا حصص لكل المنتجات عدا الأسلحة. وفي لائحة الأفضليات
          الجديدة السارية من أول يناير 2027، بقي هذا الترتيب وحده{" "}
          <strong>بلا تاريخ انتهاء</strong> بينما حُدِّدت البقيةُ حتى 2036.
        </p>
        <p className="leading-relaxed text-gray-700">ومع ذلك تُردّ الشحنات:</p>
        <ul className="list-disc space-y-2 pr-6 text-gray-700">
          {REJECTION.points.map((p) => (
            <li key={p} className="leading-relaxed">{p}</li>
          ))}
        </ul>
        <Cite source={REJECTION.source} />
        <div className="rounded-lg border-r-4 border-amber-500 bg-amber-50 p-4">
          <p className="leading-relaxed">
            حين تكون الرسوم صفراً ويبقى الرفض قائماً، فالقيدُ ليس تجارياً بل{" "}
            <strong>إثباتيّ</strong>. والقيد الإثباتي — على خلاف الرسوم والحصص —
            مسألةُ سجلّاتٍ مرتبطةٍ ومُوقَّتةٍ ومحفوظة، لا مسألةَ تفاوضٍ بين دول.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">ما يبيعه السودان</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="bg-gray-50 text-right">
              <tr>
                <th className="p-3 font-medium">السلعة</th>
                <th className="p-3 font-medium">الحصّة</th>
                <th className="p-3 font-medium">السوق</th>
                <th className="p-3 font-medium">ما يحكم قبولها</th>
              </tr>
            </thead>
            <tbody>
              {COMMODITIES.map((c) => (
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
        <Cite source={BASKET_SOURCE} />
        <p className="leading-relaxed text-gray-700">
          وما وراء هذه: {BEYOND.join(" · ")}. وكلُّها تمرّ من البوّابات نفسها —
          فمن يجتازها لسلعةٍ يجتازها لبقيّتها.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">البوّابات الأربع</h2>
        <p className="leading-relaxed text-gray-700">
          كل شحنةٍ مغادرة تمرّ بأربع بوّاباتٍ مستقلّة. وتعطّلُ واحدةٍ يوقف الصفقة
          كلَّها مهما سلمت البقية — ولذلك يُستعدّ لأربعتها معاً لا لأسهلها.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {GATES.map((g) => (
            <article key={g.title} className="flex flex-col gap-2 rounded-lg border p-4">
              <span className="text-xs tracking-widest text-emerald-700">{g.n}</span>
              <h3 className="text-xl font-bold">{g.title}</h3>
              {g.body.map((p) => (
                <p key={p} className="text-sm leading-relaxed text-gray-700">{p}</p>
              ))}
              <p className="mt-auto border-t pt-2 text-xs text-gray-500">
                من يحملها: {g.holder}
              </p>
              <Cite source={g.source} />
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">العقدة المالية — ولماذا الإثبات يساوي سعراً</h2>
        {MONEY_KNOT.paragraphs.map((p) => (
          <p key={p} className="leading-relaxed text-gray-700">{p}</p>
        ))}
        <Cite source={MONEY_KNOT.source} />
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">نافذةٌ تُغلق: اللوائح القادمة</h2>
        <p className="leading-relaxed text-gray-700">
          ما يجعل هذا التوقيت مختلفاً عن أي سنةٍ مضت هو أن أوروبا تنقل عبء
          الإثبات من الجمرك إلى المورِّد، بمواعيدَ محدَّدة:
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[38rem] text-sm">
            <thead className="bg-gray-50 text-right">
              <tr>
                <th className="p-3 font-medium">الالتزام</th>
                <th className="p-3 font-medium">يسري</th>
                <th className="p-3 font-medium">ما يطلبه</th>
                <th className="p-3 font-medium">أثره</th>
              </tr>
            </thead>
            <tbody>
              {DEADLINES.map((d) => (
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
        <Cite source={DEADLINES[0].source} />
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">ماذا يعني هذا لمن ينتج</h2>
        <p className="leading-relaxed text-gray-700">
          أن ما يُطلب منك ليس بضاعةً أفضل، بل <strong>سجلّاً أوضح</strong>: من
          أين جاءت، ومتى، وبأيّ إحداثيّة، ومن شهد عليها، وبأيّ ورقةٍ تسافر. وهذه
          كلُّها أشياء تُسجَّل وقت العمل أو لا تُسجَّل أبداً — فصورةُ مرحلةٍ لم
          تُلتقط في حينها لا تُصنع بعد الحصاد.
        </p>
        <p className="leading-relaxed text-gray-700">
          وسودجري تبني هذا الجانب: سجلُّ الموسم بمراحله وأدلّته المصوّرة
          بإحداثيّاتها وتواريخها، وسجلُّ إثبات المنشأ للتعدين بسلسلة عهدةٍ لا
          تقبل التعديل، وتوثيقُ مقدّمي الخدمة. ونشرُ سجلّك يبقى قرارك وحدك — لا
          يُنشر شيءٌ عنك إلا بإذنك.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/seasons" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-800">
            سجّل موسمك
          </Link>
          <Link href="/mining/registry" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">
            سجلّ إثبات المنشأ
          </Link>
          <Link href="/guide" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">
            دليل الاستخدام
          </Link>
        </div>
      </section>

      <section className="space-y-4 border-t pt-8">
        <h2 className="text-xl font-bold">حدود هذه الدراسة</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {LIMITS.map((l) => (
            <div key={l.title} className="space-y-2 rounded-lg bg-gray-50 p-4">
              <h3 className="text-sm font-bold">{l.title}</h3>
              <p className="text-sm leading-relaxed text-gray-600">{l.body}</p>
              <Cite source={l.source} />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
