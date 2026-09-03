import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ExportOfferDetail from "@/components/ExportOfferDetail";
import { formatMinor, OFFER_STATUS_LABEL, OFFER_STATUS_HELP, type OfferStatus } from "@/lib/exportOffers";

/**
 * تفصيلُ العرض — حيث تُبنى الأدلّة والعهدة قبل الإرسال.
 *
 * The offer list can create and submit; this is where the proof is assembled,
 * because that is the part that takes several sittings and the part a reviewer
 * will actually judge. Both are editable only while the offer is a draft or has
 * come back for repair — enforced by policy, not by hiding the form.
 */
export default async function ExportOfferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: offerRow } = await supabase
    .from("export_offers")
    .select(
      "id, reference, owner_id, season_id, quantity, uom_code, unit_price_minor, value_minor, " +
        "currency_code, status, rejection_reason, requirements_frozen_at, " +
        "corridor:export_corridors(commodity:export_commodities(name_ar), destination:export_destinations(name_ar))",
    )
    .eq("id", id)
    .maybeSingle();

  if (!offerRow) notFound();

  const offer = offerRow as unknown as {
    id: string;
    reference: string;
    owner_id: string;
    season_id: string | null;
    quantity: string;
    uom_code: string;
    unit_price_minor: number;
    value_minor: number;
    currency_code: string;
    status: OfferStatus;
    rejection_reason: string | null;
    requirements_frozen_at: string | null;
    corridor: {
      commodity: { name_ar: string } | null;
      destination: { name_ar: string } | null;
    } | null;
  };

  const isOwner = offer.owner_id === user.id;
  const editable = isOwner && (offer.status === "draft" || offer.status === "rejected");

  const [{ data: origins }, { data: custody }, { data: evidence }, { data: requirements }] =
    await Promise.all([
      supabase
        .from("export_offer_origins")
        .select("plot_ref, area_hectares, latitude, longitude, boundary")
        .eq("offer_id", id),
      supabase
        .from("export_offer_custody")
        .select("sequence, occurred_at, place_name, latitude, longitude, note")
        .eq("offer_id", id)
        .order("sequence"),
      supabase
        .from("export_offer_evidence")
        .select("id, kind, captured_at, storage_path, sha256")
        .eq("offer_id", id)
        .order("created_at"),
      supabase
        .from("export_offer_requirements")
        .select("mode, document_type:export_document_types(name_ar, note_ar)")
        .eq("offer_id", id),
    ]);

  // Evidence the farmer already has in the platform, offered for attaching.
  // Only from the season this offer names: evidence from an unrelated season
  // would say nothing about these goods, and letting it be attached would make
  // the proof look richer than it is.
  const { data: available } = offer.season_id
    ? await supabase
        .from("stage_evidence")
        .select("id, kind, caption, captured_at, storage_path, stage:season_stages!inner(season_id)")
        .eq("stage.season_id", offer.season_id)
        .not("storage_path", "is", null)
    : { data: [] };

  const attached = new Set(
    ((evidence ?? []) as { storage_path: string }[]).map((e) => e.storage_path),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/export/offers" className="text-sm text-primary underline">
        ← عروضي
      </Link>

      <h1 className="mt-3 text-2xl font-bold">{offer.reference}</h1>
      <p className="mt-1 text-sm text-muted">
        {offer.corridor?.commodity?.name_ar} ← {offer.corridor?.destination?.name_ar} ·{" "}
        {offer.quantity} {offer.uom_code} ·{" "}
        {formatMinor(offer.value_minor)} {offer.currency_code}
      </p>
      <p className="mt-1 text-sm">
        <strong>{OFFER_STATUS_LABEL[offer.status]}</strong> —{" "}
        <span className="text-muted">{OFFER_STATUS_HELP[offer.status]}</span>
      </p>

      {offer.status === "rejected" && offer.rejection_reason && (
        <p className="mt-3 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          سببُ الإعادة: {offer.rejection_reason}
        </p>
      )}

      <ExportOfferDetail
        offerId={offer.id}
        editable={editable}
        origins={(origins ?? []) as never}
        custody={(custody ?? []) as never}
        evidence={(evidence ?? []) as never}
        requirements={(requirements ?? []) as never}
        frozenAt={offer.requirements_frozen_at}
        available={((available ?? []) as unknown as {
          id: string;
          kind: string;
          caption: string | null;
          captured_at: string | null;
          storage_path: string;
        }[]).filter((e) => !attached.has(e.storage_path))}
      />
    </div>
  );
}
