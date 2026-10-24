import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "الخصوصية | سوداقري", "Privacy | Sudagri"),
    description: tr(
      locale,
      "ما تحفظه سوداقري عنك، ومن يراه، وكيف تحذف حسابك.",
      "What Sudagri keeps about you, who sees it, and how to delete your account.",
    ),
  };
}

/**
 * الخصوصية (البند ١٥٣).
 *
 * Google and Facebook both ask for a privacy page — and Facebook for the way
 * to delete one's data — before they let a site sign people in with them. It
 * says what the code does, no more: what is kept, who reads it (the land row
 * closed to strangers, backlog 127; the offer without name or place until the
 * owner accepts), where it is kept, and how to ask for it to go. Nothing here
 * is a promise the platform does not already keep.
 */
export default async function PrivacyPage() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const sections: { title: string; body: string[] }[] = [
    {
      title: t("ما نحفظه", "What we keep"),
      body: [
        t(
          "حسابك: اسمك، ورقم جوالك أو بريدك، وكلمة مرورك محفوظةً بطريقةٍ لا تُقرأ. وإن دخلت بحساب Google أو Facebook حفظنا ما يعطيناه: الاسم والبريد وصورة الحساب، ولا نرى كلمة مرورك هناك.",
          "Your account: your name, your mobile number or email, and your password, stored in a form that cannot be read back. If you sign in with Google or Facebook we keep what they give us — name, email and account picture — and never see your password there.",
        ),
        t(
          "ما تضيفه بنفسك: أرضك وموقعها ومستنداتها، ومواسمك ومصروفاتها وصورها، وقطيعك، وطلبات الشراكة والعقود، ورسائلك، وملاحظاتك.",
          "What you add yourself: your land, its location and documents; your seasons, their costs and photos; your herd; partnership requests and agreements; your messages; your feedback.",
        ),
        t(
          "وأسئلتك للمساعد الذكيّ تُرسل إلى مزوّد الذكاء الاصطناعيّ ليجيب عنها، وتُحفظ عندنا لنحسّن الإجابات.",
          "Your questions to the AI assistant are sent to the AI provider to be answered, and kept by us to improve the answers.",
        ),
      ],
    },
    {
      title: t("من يراه", "Who sees it"),
      body: [
        t(
          "صفُّ أرضك بقريتها وإحداثيّاتها لا يقرؤه غيرك وغير الإدارة. وحين تعرضها على المستثمرين يرون الولاية والمحليّة والمساحة والتربة والماء فقط، ولا يرون اسمك ولا هاتفك ولا موقعها حتى تقبل طلباً.",
          "Your land's row, with its village and coordinates, is read by no one but you and the administrators. When you offer it to investors they see only the state, locality, area, soil and water — not your name, phone or its location until you accept a request.",
        ),
        t(
          "العقد والرسائل يقرؤها أطرافها، والإدارة حين يُبلَّغ عن شيءٍ أو تُطلب مساعدتها.",
          "Agreements and messages are read by their parties, and by the administrators when something is reported or their help is asked for.",
        ),
        t("ولا نبيع بياناتك لأحد، ولا نعرض عليك إعلانات.", "We sell your data to no one and show you no advertising."),
      ],
    },
    {
      title: t("أين يُحفظ", "Where it is kept"),
      body: [
        t(
          "قاعدة البيانات والملفّات عند Supabase، والموقع يعمل على Vercel. وفي متصفّحك نحفظ جلسة دخولك ولغة العرض، وأشياء صغيرة لراحتك — أنّك شاهدت شاشة البداية، أو مسوّدة ما كتبت — ونسخاً من الصفحات العامّة لتفتح دون اتّصال. ولا نستعمل أدوات تتبّعٍ ولا إعلانات.",
          "The database and files are with Supabase, and the site runs on Vercel. In your browser we keep your sign-in session and your language, small conveniences — that you have seen the opening screen, or a draft of what you wrote — and copies of public pages so they open offline. We use no trackers and no advertising.",
        ),
      ],
    },
    {
      title: t("حذف حسابك وبياناتك", "Deleting your account and data"),
      body: [
        t(
          "اكتب لنا من صفحة «ملاحظات واقتراحات» أنّك تريد حذف حسابك، من الحساب نفسه أو مع رقمه أو بريده، فنحذف الحساب وما أضفته فيه ونؤكّد لك ذلك. وما يخصّ طرفاً آخر معك — عقدٌ وقّعتماه أو رسائل بينكما — يبقى عنده، لأنّه سجلُّه أيضاً.",
          "Write to us from the «Feedback» page that you want your account deleted — from the account itself, or giving its number or email — and we delete the account and what you added in it, and confirm it to you. What belongs to another party with you — an agreement you both signed, or messages between you — stays with them, because it is their record too.",
        ),
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader icon="book" eyebrow={t("سوداقري", "Sudagri")} title={t("الخصوصية", "Privacy")}>
        {t("ما نحفظه عنك، ومن يراه، وكيف تحذفه.", "What we keep about you, who sees it, and how to delete it.")}
      </PageHeader>
      <div className="flex flex-col gap-6 leading-8">
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="title-bar mb-2 text-lg font-black">{s.title}</h2>
            {s.body.map((p) => (
              <p key={p} className="mt-2">
                {p}
              </p>
            ))}
          </section>
        ))}
        <p>
          <Link href="/feedback" className="font-bold text-primary underline">
            {t("ملاحظات واقتراحات — ومنها طلب الحذف", "Feedback — including a deletion request")}
          </Link>
        </p>
      </div>
    </div>
  );
}
