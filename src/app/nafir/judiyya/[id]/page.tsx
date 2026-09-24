import { notFound } from "next/navigation";
import NafirShell, { button, field, ghost } from "@/components/nafir/NafirShell";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import { nafirViewer } from "@/lib/nafirViewer";
import {
  JUDIYYA_KINDS,
  JUDIYYA_STATUS,
  ageAr,
  type JudiyyaCase,
  type JudiyyaMediator,
  type JudiyyaPanelSeat,
  type JudiyyaParty,
} from "@/lib/nafir";
import { accept, approve, commit, confirm, withdraw, writeSettlement } from "../actions";

export const metadata = { title: "طلب جودية | سودجري", robots: { index: false } };

/**
 * One case, as whoever is looking can act on it. Row-level security decides
 * who may look at all (the parties, the case's mediators, the administration)
 * — anyone else gets «not found», which is also what a case that does not
 * exist looks like, so a guessed address learns nothing.
 */
export default async function JudiyyaCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user, name } = await nafirViewer();
  if (!user) notFound();

  const [{ data: caseRow }, { data: partyRows }, { data: seatRows }, { data: medRows }] = await Promise.all([
    supabase.from("judiyya_cases").select("*").eq("id", id).maybeSingle(),
    supabase.from("judiyya_parties").select("*").eq("case_id", id),
    supabase.from("judiyya_panel").select("*").eq("case_id", id),
    supabase.from("judiyya_mediators").select("*").not("verified_at", "is", null),
  ]);
  const k = caseRow as JudiyyaCase | null;
  if (!k) notFound();
  const parties = (partyRows ?? []) as JudiyyaParty[];
  const seats = (seatRows ?? []) as JudiyyaPanelSeat[];
  const mediators = (medRows ?? []) as JudiyyaMediator[];
  const a = parties.find((p) => p.side === "a");
  const b = parties.find((p) => p.side === "b");
  const me = parties.find((p) => p.user_id === user.id);
  const mySeat = seats.find((s) => s.mediator_id === user.id);
  const seated = seats.filter((s) => s.approved_a && s.approved_b && s.accepted_at);
  const medName = (uid: string) => mediators.find((m) => m.user_id === uid)?.display_name ?? "أجويد";
  const live = k.status === "forming" || k.status === "active";


  return (
    <NafirShell active="/nafir/judiyya" ok={ok} error={error}>
      <p className="text-sm font-medium text-primary">
        جودية · {JUDIYYA_KINDS[k.kind]} · {k.state} — {k.locality} · {JUDIYYA_STATUS[k.status]}
      </p>
      <h1 className="mt-1 text-2xl font-bold">{k.title}</h1>
      <p className="mt-1 text-xs text-muted">فُتح {ageAr(k.created_at)} · لا يرى هذه الصفحة إلا طرفاها وأجاويدها والإدارة</p>
      <p className="mt-4 whitespace-pre-line leading-8">{k.summary}</p>

      <ol className="mt-6 flex flex-col gap-3">
        <Step n={1} done={!!b} title="دخول الطرفين">
          <p>
            {a?.display_name ?? "—"} {b ? `و${b.display_name}` : "— وينتظر الطرفَ الآخر"}
          </p>
          {!b && me?.side === "a" && k.status === "forming" && (
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-muted">أرسل هذا الرابط للطرف الآخر وحده — يعمل مرّةً واحدة:</p>
              <ShareWhatsApp
                path={`/nafir/judiyya/join/${k.invite_token}`}
                text={`أدعوك إلى الجودية في «${k.title}» — أجاويد يرضاهم الطرفان، والصلح بيننا:`}
              />
            </div>
          )}
        </Step>

        <Step n={2} done={!!(a?.committed_at && b?.committed_at)} title="الالتزام بقبول الحكم قبل سماعه">
          <p>
            {a?.display_name}: {a?.committed_at ? "التزم" : "لم يلتزم بعد"}
            {b && <> · {b.display_name}: {b.committed_at ? "التزم" : "لم يلتزم بعد"}</>}
          </p>
          {me && !me.committed_at && k.status === "forming" && b && (
            <form action={commit} className="mt-2">
              <input type="hidden" name="case_id" value={k.id} />
              <button className={button}>ألتزم بقبول حكم الأجاويد قبل أن أسمعه</button>
            </form>
          )}
        </Step>

        <Step n={3} done={seated.length > 0} title="اختيار الأجاويد">
          {k.status === "forming" ? (
            <p className="text-muted">بعد التزام الطرفين.</p>
          ) : (
            <>
              {seated.length > 0 && (
                <p>اللجنة: {seated.map((s) => medName(s.mediator_id)).join("، ")}</p>
              )}
              {me && k.status === "active" && (
                <ul className="mt-2 flex flex-col gap-2">
                  {mediators
                    .filter((m) => !parties.some((p) => p.user_id === m.user_id))
                    .map((m) => {
                      const s = seats.find((x) => x.mediator_id === m.user_id);
                      const mine = me.side === "a" ? s?.approved_a : s?.approved_b;
                      const theirs = me.side === "a" ? s?.approved_b : s?.approved_a;
                      return (
                        <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2">
                          <span>
                            <strong>{m.display_name}</strong> <span className="text-xs text-muted">· {m.state}</span>
                            <span className="block text-xs text-muted">
                              {theirs ? "رضيه الطرف الآخر" : ""}
                              {s?.accepted_at ? " · قَبِل" : s?.approved_a && s?.approved_b ? " · ينتظر قبوله" : ""}
                            </span>
                          </span>
                          <form action={approve}>
                            <input type="hidden" name="case_id" value={k.id} />
                            <input type="hidden" name="mediator_id" value={m.user_id} />
                            <input type="hidden" name="on" value={mine ? "0" : "1"} />
                            <button className={mine ? ghost : button}>{mine ? "أسحب رضاي" : "أرضاه"}</button>
                          </form>
                        </li>
                      );
                    })}
                </ul>
              )}
              {mySeat && mySeat.approved_a && mySeat.approved_b && !mySeat.accepted_at && (
                <form action={accept} className="mt-2">
                  <input type="hidden" name="case_id" value={k.id} />
                  <p className="mb-2">اختارك الطرفان أجويداً. هل تقبل الوساطة؟</p>
                  <button className={button}>أقبل، وأشهد أني لستُ طرفاً</button>
                </form>
              )}
            </>
          )}
        </Step>

        <Step n={4} done={!!k.settlement} title="كتابة الصلح">
          {k.settlement ? (
            <div className="rounded-xl border border-primary/40 bg-background p-3">
              <p className="whitespace-pre-line">{k.settlement}</p>
              <p className="mt-1 text-xs text-muted">كتبه {k.settlement_name} · {k.settlement_at && ageAr(k.settlement_at)}</p>
            </div>
          ) : (
            <p className="text-muted">يكتبه أحد الأجاويد بعد سماع الطرفين.</p>
          )}
          {mySeat?.accepted_at && k.status === "active" && (
            <form action={writeSettlement} className="mt-2 flex flex-col gap-2">
              <input type="hidden" name="case_id" value={k.id} />
              <textarea name="settlement" required minLength={20} maxLength={3000} rows={4} defaultValue={k.settlement ?? ""} className={field} placeholder="نصّ الصلح كما اتُّفق عليه" />
              <div className="flex flex-wrap items-center gap-2">
                <input name="settlement_name" required minLength={2} maxLength={60} defaultValue={name} className={`${field} w-48`} />
                <button className={button}>{k.settlement ? "عدّل الصلح" : "اكتب الصلح"}</button>
              </div>
              {k.settlement && <p className="text-xs text-muted">التعديل يُسقط إقرار الطرفين ويُعيد طلبه.</p>}
            </form>
          )}
        </Step>

        <Step n={5} done={k.status === "settled"} title="إقرار الطرفين وختم الصلح">
          <p>
            {a?.display_name}: {a?.confirmed_at ? "أقرّ" : "لم يُقرّ"}
            {b && <> · {b.display_name}: {b.confirmed_at ? "أقرّ" : "لم يُقرّ"}</>}
          </p>
          {me && !me.confirmed_at && k.settlement && k.status === "active" && (
            <form action={confirm} className="mt-2">
              <input type="hidden" name="case_id" value={k.id} />
              <button className={button}>أُقرّ هذا الصلح</button>
            </form>
          )}
          {k.status === "settled" && (
            <p className="mt-1 font-bold text-primary">خُتم الصلح {k.settled_at && ageAr(k.settled_at)}. «والصلح خير».</p>
          )}
        </Step>
      </ol>

      {me && live && (
        <form action={withdraw} className="mt-6">
          <input type="hidden" name="case_id" value={k.id} />
          <button className="text-sm text-danger underline">اسحب الطلب</button>
        </form>
      )}
    </NafirShell>
  );
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className={`rounded-2xl border p-4 ${done ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <p className="font-bold">
        <span className="figure me-2 text-primary">{done ? "✓" : n.toLocaleString("ar")}</span>
        {title}
      </p>
      {children && <div className="mt-2 text-sm leading-7">{children}</div>}
    </li>
  );
}
