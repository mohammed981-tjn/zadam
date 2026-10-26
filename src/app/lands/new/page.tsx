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

export default async function NewLandPage({ searchParams }: PageProps<"/lands/new">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginTo("/lands/new"));

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  // وضع الوكيل (البند ١٦٩): «?for=» names a farmer who authorised this company for lands. Anything else is ignored and
  // the form registers the caller's own land; the database is what refuses a land in someone else's name.
  const forId = (await searchParams).for;
  let farmer: { farmer_id: string; full_name: string | null } | null = null;
  if (typeof forId === "string") {
    const { data } = await supabase.rpc("agent_my_farmers");
    farmer =
      ((data ?? []) as { farmer_id: string | null; full_name: string | null; status: string; scopes: string[] }[])
        .filter((m) => m.status === "active" && m.farmer_id === forId && m.scopes.includes("lands"))
        .map((m) => ({ farmer_id: m.farmer_id as string, full_name: m.full_name }))[0] ?? null;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {farmer && (
        <p className="mb-4 rounded-xl bg-primary/10 p-3 text-sm font-medium text-primary">
          {t(
            `تسجّل هذه الأرض باسم «${farmer.full_name ?? ""}» بالإذن الذي أعطاك. تُسجَّل له لا لك، ويُخبَر بها.`,
            `You are registering this land in the name of «${farmer.full_name ?? ""}», under the permission they gave you. It is registered as theirs, not yours, and they are told.`,
          )}
        </p>
      )}
      <h1 className="text-2xl font-bold">
        {farmer ? t("سجّل أرضاً لمزارعك", "Register a land for your farmer") : t("سجّل أرضك", "Register your land")}
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

      <LandForm forFarmer={farmer?.farmer_id} />
    </div>
  );
}
