"use client";

import { useActionState, useMemo, useState } from "react";
import Explain, { Steps, EmptyState } from "@/components/Explain";
import { planSeason } from "@/lib/season";
import {
  buildMilestonePlan,
  SERVICE_BY_KEY,
  SERVICE_UNIT_LABEL,
  type ServiceKey,
} from "@/lib/services";
import type { IrrigationMethod } from "@/lib/agronomy";
import { createContract, type ActionResult } from "@/app/contracts/actions";

const field =
  "rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary";
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

export interface BuilderSeason {
  id: string;
  name: string;
  crop_key: string;
  station_key: string;
  irrigation: IrrigationMethod;
  feddans: number;
  budget_per_feddan: number;
  planting_date: string;
}

export interface BuilderOffer {
  provider_id: string;
  provider_name: string;
  service_key: ServiceKey;
  price_per_unit: number;
}

export interface BuilderHerd {
  id: string;
  name: string;
  head_count: number;
  start_date: string;
  end_date: string | null;
}

export default function ContractBuilder({
  seasons,
  herds,
  offers,
}: {
  seasons: BuilderSeason[];
  herds: BuilderHerd[];
  offers: BuilderOffer[];
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(createContract, null);

  // Which side of production this contract serves. The database allows exactly
  // one, so the form asks once rather than letting both be filled in.
  const [unitKind, setUnitKind] = useState<"season" | "herd">(
    seasons.length > 0 ? "season" : "herd",
  );
  const [seasonId, setSeasonId] = useState(seasons[0]?.id ?? "");
  const [herdId, setHerdId] = useState(herds[0]?.id ?? "");
  const [providerId, setProviderId] = useState(offers[0]?.provider_id ?? "");
  const [picked, setPicked] = useState<ServiceKey[]>([]);

  const season = seasons.find((s) => s.id === seasonId);
  const herd = herds.find((h) => h.id === herdId);
  const providerOffers = offers.filter((o) => o.provider_id === providerId);

  const providers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of offers) seen.set(o.provider_id, o.provider_name);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [offers]);

  /*
   * The same derivation the server will run, run here for the preview.
   *
   * Not a duplicate rule with a chance to disagree: buildMilestonePlan is one
   * function imported by both, and the server re-reads the season and the
   * prices from the database rather than trusting anything this component
   * computed. What the visitor sees before pressing the button is therefore the
   * same arithmetic that will be recorded — shown first, so nobody is asked to
   * commit to a number they have not seen.
   */
  const preview = useMemo(() => {
    const priceFor = new Map(
      providerOffers.map((o) => [o.service_key, o.price_per_unit]),
    );
    const choices = picked
      .filter((k) => priceFor.has(k))
      .map((k) => ({ serviceKey: k, unitPrice: priceFor.get(k)! }));

    if (unitKind === "herd") {
      if (!herd) return [];
      const start = new Date(herd.start_date);
      const end = herd.end_date ? new Date(herd.end_date) : null;
      const months =
        end && !Number.isNaN(end.getTime())
          ? Math.max(
              1,
              Math.round((end.getTime() - start.getTime()) / 2_629_800_000),
            )
          : 1;

      // No phase windows: a herd's phases are not the crop calendar the
      // catalogue's `phase` field names, so these lines carry no dates rather
      // than dates borrowed from a plant's growth stages.
      return buildMilestonePlan(
        choices,
        { headCount: herd.head_count, months },
        [],
      );
    }

    if (!season) return [];

    const plan = planSeason(
      season.crop_key,
      season.station_key,
      season.planting_date,
      season.irrigation,
      season.feddans,
      season.budget_per_feddan,
    );
    if (!plan) return [];

    return buildMilestonePlan(
      choices,
      { feddans: plan.feddans, waterM3: plan.totalWaterM3 },
      plan.stages.map((s) => ({
        key: s.key,
        startDate: s.startDate,
        endDate: s.endDate,
      })),
    );
  }, [unitKind, season, herd, providerOffers, picked]);

  const total = preview.reduce((sum, m) => sum + m.amount, 0);

  const toggle = (key: ServiceKey) =>
    setPicked((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  if (seasons.length === 0 && herds.length === 0) {
    return (
      <EmptyState title="لا يوجد موسم ولا دورة لتتعاقد عليها بعد">
        العقد يُبنى على موسم زراعي أو دورة إنتاج حيواني قائمة: منها تُؤخذ
        الكميات — المساحة والاحتياج المائي للموسم، وعدد الرؤوس وطول الدورة
        للقطيع. أنشئ أحدهما أولاً ثم عد إلى هنا.
      </EmptyState>
    );
  }

  if (providers.length === 0) {
    return (
      <EmptyState title="لا يوجد مقدّم خدمة موثّق بعد">
        لا يمكن التعاقد إلا مع جهة راجعتها الإدارة ووثّقتها. إن كنت تقدّم خدمات
        زراعية، سجّل جهتك وستظهر هنا بعد التوثيق.
      </EmptyState>
    );
  }

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-5">
        <Steps
          steps={["الموسم والمزوّد", "اختيار الخدمات", "مراجعة العقد"]}
          current={picked.length === 0 ? 1 : 2}
        />

        <fieldset className="grid gap-4 rounded-2xl border border-border bg-card p-5">
          <legend className="px-2 text-sm font-bold">على أي إنتاج؟</legend>

          <input type="hidden" name="unit_kind" value={unitKind} />

          {seasons.length > 0 && herds.length > 0 && (
            <div className="flex gap-2 text-sm">
              {(
                [
                  ["season", "موسم زراعي"],
                  ["herd", "دورة إنتاج حيواني"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setUnitKind(value);
                    setPicked([]);
                  }}
                  className={`rounded-full border px-4 py-1.5 ${
                    unitKind === value
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border text-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {unitKind === "season" ? (
            <label className="flex flex-col gap-1 text-sm">
              الموسم
              <select
                name="unit_id"
                value={seasonId}
                onChange={(e) => setSeasonId(e.target.value)}
                className={field}
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {n0(s.feddans)} فدان
                  </option>
                ))}
              </select>
              <Explain tone="why">
                الكميات في العقد تُحسب من هذا الموسم: المساحة بالفدان، والاحتياج
                المائي المشتق بمعادلة FAO-56، وتواريخ المراحل. لا تُكتب يدوياً،
                فيمكنك أنت والمزوّد إعادة حسابها.
              </Explain>
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              الدورة
              <select
                name="unit_id"
                value={herdId}
                onChange={(e) => setHerdId(e.target.value)}
                className={field}
              >
                {herds.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} — {n0(h.head_count)} رأس
                  </option>
                ))}
              </select>
              <Explain tone="why">
                الكميات تُحسب من هذه الدورة: عدد الرؤوس للخدمات البيطرية
                والتغذوية، وطول الدورة بالأشهر للمتابعة الدورية. الخدمات التي لا
                تنطبق على الإنتاج الحيواني تُسقَط من الخطة ولا تُسعَّر بصفر.
              </Explain>
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm">
            مقدّم الخدمة
            <select
              name="provider_id"
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value);
                setPicked([]);
              }}
              className={field}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            عنوان العقد
            <input
              name="title"
              required
              className={field}
              placeholder="مثال: عقد إعداد الأرض — موسم الذرة ٢٠٢٦"
            />
          </label>
        </fieldset>

        <fieldset className="rounded-2xl border border-border bg-card p-5">
          <legend className="px-2 text-sm font-bold">أي خدمات؟</legend>

          {providerOffers.length === 0 ? (
            <p className="text-sm text-muted">
              لم يُدرج هذا المزوّد أي خدمة بعد.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {providerOffers.map((offer) => {
                const def = SERVICE_BY_KEY[offer.service_key];
                if (!def) return null;
                const on = picked.includes(offer.service_key);

                return (
                  <label
                    key={offer.service_key}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                      on ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="service_key"
                      value={offer.service_key}
                      checked={on}
                      onChange={() => toggle(offer.service_key)}
                      className="mt-1 size-4 accent-[var(--primary)]"
                    />
                    <span className="flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{def.name}</span>
                        <span className="text-sm">
                          {n0(offer.price_per_unit)} /{" "}
                          {SERVICE_UNIT_LABEL[def.unit]}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted">
                        {def.note}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        {state && !state.ok && (
          <p className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm">
            {state.message}
          </p>
        )}
      </div>

      {/* The receipt, built as you choose — nobody signs a number they have not seen. */}
      <aside className="flex h-fit flex-col gap-3 rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-6">
        <h2 className="text-sm font-bold">خطة العقد</h2>

        {preview.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted">
            اختر خدمة لترى مراحل العقد وتواريخها ومبالغها محسوبة من موسمك.
          </p>
        ) : (
          <>
            <ol className="flex flex-col gap-3">
              {preview.map((m) => (
                <li
                  key={m.seq}
                  className="border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">
                      {m.seq}. {m.title}
                    </span>
                    <span className="shrink-0 text-sm">{n0(m.amount)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {n0(m.quantity)} {SERVICE_UNIT_LABEL[m.unit]} ×{" "}
                    {n0(m.unitPrice)}
                    {m.plannedStart && <> — يبدأ {m.plannedStart}</>}
                  </p>
                </li>
              ))}
            </ol>

            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="font-bold">الإجمالي</span>
              <span className="text-lg font-bold">{n0(total)}</span>
            </div>

            <Explain tone="why">
              كل مرحلة تُدفع وحدها بعد إثبات تنفيذها بصورة أو تقرير. لن يُفرَج عن
              دفعة قبل اعتماد مرحلتها، ولا تُعتمد مرحلة قبل التي قبلها.
            </Explain>
          </>
        )}

        <button
          type="submit"
          disabled={pending || preview.length === 0}
          className="mt-1 rounded-lg bg-primary px-6 py-2.5 font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "جارٍ الإنشاء..." : "أنشئ العقد كمسودة"}
        </button>

        <p className="text-xs text-muted">
          يُحفظ كمسودة — لا يلزم أحداً قبل أن يوقّعه الطرفان.
        </p>
      </aside>
    </form>
  );
}
