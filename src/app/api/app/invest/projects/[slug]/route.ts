import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { createPublicClient } from "@/lib/supabase/public";
import { loadLandOffers, loadProjectLands } from "@/lib/landOffers";
import { VISITOR_COLUMNS } from "@/lib/visitorColumns";
import { investmentLive } from "@/lib/platformFlags";
import { feeLine, investGlossary, landOfferJson, projectCardJson, projectStudyJson } from "@/lib/appInvest";
import type { Project, ProjectUpdate } from "@/types/database";

/**
 * One opportunity in the app (backlog 203), as /projects/[slug] shows it: the trial or illustrative label, the
 * study its score came from, the risk notice, the field reports, whether a verified land stands under it — and,
 * for a member, that land's own offer card to ask for a partnership on, or for the land's owner the one-tap
 * «اعرض أرضي على المستثمرين» with the models chosen last time.
 *
 * A visitor reads as the anonymous visitor reads; the app's session reads as that person, and a refused session is
 * refused (see ../../route.ts). projects.land_id is not a visitor's or a member's column (backlogs 132, 181): the
 * land comes through `project_open_land` only when it is open to investors, exactly as on the website.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const sent = Boolean(req.headers.get("authorization"));
  const auth = sent ? await clientFromBearer(req) : null;
  if (sent && !auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const supabase = auth?.supabase ?? createPublicClient();
  const { slug } = await params;

  const { data: row } = await supabase.from("projects").select(VISITOR_COLUMNS.projects).eq("slug", slug).maybeSingle();
  if (!row) return NextResponse.json({ error: "لم نجد هذه الفرصة." }, { status: 404 });
  const p = row as unknown as Project;

  const [{ data: updates }, projectLands, live] = await Promise.all([
    supabase.from("project_updates").select("*").eq("project_id", p.id).order("created_at", { ascending: false }),
    loadProjectLands(supabase),
    investmentLive(supabase),
  ]);
  const verifiedLand = projectLands.get(p.id);

  let offer: ReturnType<typeof landOfferJson> | null = null;
  let ownLand: { id: string; models: string[]; note: string | null } | null = null;
  let inspection = { inspections_on: false, fee_line: "" };
  if (auth && verifiedLand) {
    const [{ data: openLand }, offers] = await Promise.all([
      supabase.rpc("project_open_land", { p_project: p.id }),
      loadLandOffers(supabase, true),
    ]);
    inspection = { inspections_on: offers.inspectionsOn, fee_line: feeLine(offers.fee, "ar") };
    const landId = (openLand as string | null) ?? null;
    const found = landId ? offers.lands.find((l) => l.land_id === landId) : undefined;
    if (found) offer = landOfferJson(found, offers.openInspection.get(found.land_id));
    if (landId && !found) {
      const { data } = await supabase
        .from("lands")
        .select("id, investor_models, investor_note")
        .eq("id", landId)
        .eq("owner_id", auth.user.id)
        .maybeSingle();
      const own = data as { id: string; investor_models: string[] | null; investor_note: string | null } | null;
      if (own) ownLand = { id: own.id, models: own.investor_models ?? [], note: own.investor_note };
    }
  }

  return NextResponse.json(
    {
      signed_in: Boolean(auth),
      project: projectCardJson(p, verifiedLand),
      study: projectStudyJson(p),
      // The trial note in full, as the project page writes it above everything else.
      trial_note: p.trial && !p.is_demo
        ? "منفّذها من فريق المنصّة نفسه، على أرضٍ يملكها أحد أفراده، لتجربة المسار كاملاً قبل فرص المزارعين. سجلّ المواسم التجريبيّة لا يُحسب في درجة الثقة."
        : null,
      demo_note: p.is_demo
        ? "هذا المشروع مُدخل لعرض شكل المنصة فقط — لا يوجد على الأرض مشروع بهذا الاسم ولا أرض مخصصة له، ولا يمكن الاستثمار فيه. المشاريع الحقيقية ستُنشر بعد توثيقها قانونياً ومعاينتها ميدانياً."
        : null,
      updates: ((updates ?? []) as ProjectUpdate[]).map((u) => ({ id: u.id, title: u.title, body: u.body, at: u.created_at })),
      // Paying through the platform: the server refuses it until the flag is on, whatever any screen shows.
      investment_open: live && !p.is_demo && p.status === "open",
      is_submitter: Boolean(auth) && auth?.user.id === p.submitted_by,
      offer,
      own_land: ownLand,
      ...inspection,
      ...investGlossary(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
