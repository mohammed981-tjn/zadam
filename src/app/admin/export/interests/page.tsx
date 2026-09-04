import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import InterestCard from "@/components/InterestCard";

export const metadata = { title: "طلبات المشترين · سودجري" };

interface Row {
  id: string;
  buyer_name: string;
  buyer_company: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  buyer_country: string | null;
  quantity_wanted: string | null;
  message: string | null;
  status: "new" | "contacted" | "closed";
  handled_note: string | null;
  created_at: string;
  offer: {
    reference: string;
    quantity: string;
    uom_code: string;
    corridor: {
      commodity: { name_ar: string } | null;
      destination: { name_ar: string } | null;
    } | null;
  } | null;
}

/**
 * صندوقُ طلبات المشترين — وهو أرخصُ بحثِ سوقٍ تملكه المنصّة.
 *
 * WHY THE NEWEST IS FIRST HERE, WHERE THE REVIEW QUEUE IS OLDEST-FIRST
 *
 * The orderings answer different questions and the difference is not
 * cosmetic. A submitted offer waiting three days is still an offer; a buyer
 * waiting three days has bought from someone else. The review queue must not
 * starve its tail, and this one must not starve its head.
 *
 * WHAT THIS SCREEN IS ACTUALLY FOR
 *
 * Two things, and the second is the one that compounds. The first is replying.
 * The second is that every row is a fact about demand nobody could otherwise
 * buy: which commodity, from which country, in what quantity, and how often —
 * asked by people who took the trouble to write. That is why nothing here is
 * deletable and why a closed request stays.
 */
export default async function AdminInterestsPage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("export_offer_interests")
    .select(
      "id, buyer_name, buyer_company, buyer_email, buyer_phone, buyer_country, " +
        "quantity_wanted, message, status, handled_note, created_at, " +
        "offer:export_offers(reference, quantity, uom_code, " +
        "corridor:export_corridors(commodity:export_commodities(name_ar), destination:export_destinations(name_ar)))",
    )
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Row[];
  const fresh = rows.filter((r) => r.status === "new");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">
          طلبات المشترين {fresh.length > 0 && `(${fresh.length} جديد)`}
        </h1>
        <div className="flex gap-3">
          <Link href="/admin/export" className="text-sm text-primary underline">
            طابور المراجعة
          </Link>
          <Link href="/admin" className="text-sm text-primary underline">
            لوحة الإدارة
          </Link>
        </div>
      </div>

      <p className="mb-6 text-sm leading-7 text-muted">
        الأحدثُ أوّلاً — مشترٍ ينتظر ثلاثة أيام يكون قد اشترى من غيرك.{" "}
        <strong>وأنت من يقرّر متى يُعرَّف الطرفان ببعضهما</strong>، وتلك لحظةُ
        قيمتك: منصّةٌ تسلّم العنوانين في أوّل ردٍّ لا تحتاجها الصفقةُ الثانية.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
          لا طلباتٍ بعد.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => (
            <InterestCard
              key={r.id}
              id={r.id}
              status={r.status}
              handledNote={r.handled_note}
              createdAt={r.created_at}
              buyer={{
                name: r.buyer_name,
                company: r.buyer_company,
                email: r.buyer_email,
                phone: r.buyer_phone,
                country: r.buyer_country,
              }}
              wanted={r.quantity_wanted}
              message={r.message}
              offer={
                r.offer
                  ? {
                      reference: r.offer.reference,
                      commodity: r.offer.corridor?.commodity?.name_ar ?? "—",
                      destination: r.offer.corridor?.destination?.name_ar ?? "—",
                      quantity: `${r.offer.quantity} ${r.offer.uom_code}`,
                    }
                  : null
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
