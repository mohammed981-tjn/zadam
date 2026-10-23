import { redirect } from "next/navigation";
import { loginTo } from "@/lib/authEntry";
import { createClient } from "@/lib/supabase/server";
import LandForm from "@/components/LandForm";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "سجّل أرضك | سوداقري", "Register your land | Sudagri") };
}

export default async function NewLandPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginTo("/lands/new"));

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">
        {t("سجّل أرضك", "Register your land")}
      </h1>
      <p className="mb-8 mt-2 text-sm text-muted">
        {t(
          "صِف أرضك مرة واحدة، وستُبنى عليها مواسمك وفرصك الاستثمارية بعد ذلك دون إعادة إدخال. وأثناء إدخال بيانات المياه سيخبرك النظام فوراً أي المحاصيل تكفيها مياهك فعلاً.",
          "Describe your land once, and your seasons and investment opportunities will be built on it from then on without re-entering anything. As you enter the water details, the system tells you straight away which crops your water can actually support.",
        )}
      </p>

      {/*
        سياسةُ التسجيل، قبل أن يُكتب حرف (البند ١٤٢). The owner: «هناك خطورة
        أن يسجّل كلّ زائرٍ أرضه وتحصل نزاعات — التسجيل ليس عشوائيّاً إلّا بعد
        اعتماد المنصّة وإثبات الحيازة». All three rules are enforced in the
        database — the listing gate, the reopening on a change of facts, and
        the flag to the administrators — so this says what is already true.
      */}
      <section className="mb-8 rounded-2xl border border-accent/40 bg-accent/5 p-5 text-sm leading-relaxed">
        <h2 className="mb-2 font-bold">{t("قبل أن تسجّل: هكذا تُحمى الأرض من النزاع", "Before you register: how land is kept out of disputes")}</h2>
        <ul className="list-disc space-y-1 ps-5">
          <li>
            {t(
              "لا تُعرض أرضك لأحد — لا على الخريطة ولا للمستثمرين — قبل أن تراجع الإدارة مستندات حيازتها وتعتمدها.",
              "Your land is shown to no one — not on the map, not to investors — before the administration reviews its ownership papers and approves it.",
            )}
          </li>
          <li>
            {t(
              "بعد اعتمادها، تغييرُ موقعها أو مساحتها أو مائها أو تربتها أو نوع حيازتها يعيدها إلى المراجعة.",
              "Once approved, changing its location, area, water, soil or tenure sends it back for review.",
            )}
          </li>
          <li>
            {t(
              "إن سُجّلت أرضٌ قرب أرضٍ مسجّلة باسم شخصٍ آخر، تُنبَّه الإدارة لتتحقّق من الحدود والحيازة قبل الاعتماد.",
              "If a land is registered near one in another person's name, the administration is alerted to check the boundaries and ownership before approving.",
            )}
          </li>
          <li>
            {t(
              "سجّل أرضاً تملكها أو تحوزها فعلاً، فالتسجيل بلا حيازةٍ تثبتها المستندات يُرفض.",
              "Register only land you own or actually hold: a registration without papers proving the holding is refused.",
            )}
          </li>
        </ul>
      </section>

      <LandForm />
    </div>
  );
}
