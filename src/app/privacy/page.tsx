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
      "ما تحفظه سوداقري عنك، ومن يراه، وكيف تُغلق حسابك.",
      "What Sudagri keeps about you, who sees it, and how to close your account.",
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
      title: t("إغلاق حسابك وبياناتك", "Closing your account and your data"),
      body: [
        t(
          "اطلب إغلاق حسابك من صفحة «إغلاق الحساب» وأنت داخلٌ إليه، ونزّل منها قبل ذلك ملفّاً بدفاترك وعقودك وأراضيك. فإن لم تستطع الدخول فاكتب لنا من صفحة «ملاحظات واقتراحات» مع رقم الحساب أو بريده. وتُغلقه الإدارة: يتوقّف دخولك، ويختفي اسمك وجوّالك وبريدك عن الناس كلّهم، وتُحذف إشعاراتك وتنبيهاتك.",
          "Ask to close your account from the «Close account» page while signed in, and download from it first a file with your books, agreements and land. If you cannot sign in, write to us from the «Feedback» page with the account's number or email. The administrators close it: your sign-in stops, your name, phone and email are hidden from everyone, and your notifications and alerts are deleted.",
        ),
        t(
          "ولا نحذف الدفاتر والعقود والرسائل: فيها حقٌّ لطرفٍ آخر معك، فتبقى باسم «حساب مُغلَق». ويبقى اسمك وجوّالك عند الإدارة وحدها، لا يراهما غيرها، حتى تمحوهما بفعلٍ صريح يُسجَّل فيه من محا ومتى ولماذا.",
          "We do not delete books, agreements or messages: another party with you has a right to them, so they stay under «Closed account». Your name and phone stay with the administrators alone, seen by no one else, until they erase them by an explicit act that records who erased them, when and why.",
        ),
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader icon="book" eyebrow={t("سوداقري", "Sudagri")} title={t("الخصوصية", "Privacy")}>
        {t("ما نحفظه عنك، ومن يراه، وكيف تُغلق حسابك.", "What we keep about you, who sees it, and how to close your account.")}
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
          <Link href="/account/close" className="font-bold text-primary underline">
            {t("إغلاق الحساب وتنزيل بياناتك", "Close your account and download your data")}
          </Link>
          {" · "}
          <Link href="/feedback" className="font-bold text-primary underline">
            {t("ملاحظات واقتراحات", "Feedback")}
          </Link>
        </p>
      </div>
    </div>
  );
}
