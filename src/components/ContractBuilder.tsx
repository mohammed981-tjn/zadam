"use client";

import { useActionState, useMemo, useState } from "react";
import Explain, { Steps, EmptyState } from "@/components/Explain";
import { planSeason } from "@/lib/season";
import {
  buildMilestonePlan,
  SERVICE_BY_KEY,
  serviceName,
  serviceNote,
  serviceUnitLabel,
  type ServiceKey,
} from "@/lib/services";
import type { IrrigationMethod } from "@/lib/agronomy";
import { createContract, type ActionResult } from "@/app/contracts/actions";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";

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
  initialHerdId,
  initialSeasonId,
}: {
  seasons: BuilderSeason[];
  herds: BuilderHerd[];
  offers: BuilderOffer[];
  /** وحدةٌ يُفتح عليها النموذج — تُتجاهل إن لم تكن في القائمة. */
  initialHerdId?: string;
  initialSeasonId?: string;
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(createContract, null);
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  // Which side of production this contract serves. The database allows exactly
  // one, so the form asks once rather than letting both be filled in.
  const presetHerd = herds.find((h) => h.id === initialHerdId);
  const presetSeason = seasons.find((s) => s.id === initialSeasonId);
  const [unitKind, setUnitKind] = useState<"season" | "herd">(
    presetHerd ? "herd" : presetSeason || seasons.length > 0 ? "season" : "herd",
  );
  const [seasonId, setSeasonId] = useState(
    presetSeason?.id ?? seasons[0]?.id ?? "",
  );
  const [herdId, setHerdId] = useState(presetHerd?.id ?? herds[0]?.id ?? "");
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
      <EmptyState
        title={t(
          "لا يوجد موسم ولا دورة لتتعاقد عليها بعد",
          "You have no season or livestock cycle to contract for yet",
        )}
      >
        {t(
          "العقد يُبنى على موسم زراعي أو دورة إنتاج حيواني قائمة: منها تُؤخذ الكميات — المساحة والاحتياج المائي للموسم، وعدد الرؤوس وطول الدورة للقطيع. أنشئ أحدهما أولاً ثم عد إلى هنا.",
          "A contract is built on an existing crop season or livestock cycle: that is where the quantities come from — area and water requirement for a season, head count and cycle length for a herd. Create one of them first, then come back here.",
        )}
      </EmptyState>
    );
  }

  if (providers.length === 0) {
    return (
      <EmptyState title={t("لا يوجد مقدّم خدمة موثّق بعد", "No verified service provider yet")}>
        {t(
          "لا يمكن التعاقد إلا مع جهة راجعتها الإدارة ووثّقتها. إن كنت تقدّم خدمات زراعية، سجّل جهتك وستظهر هنا بعد التوثيق.",
          "You can only contract with an organisation the administrators have reviewed and verified. If you provide agricultural services, register your organisation and it will appear here once verified.",
        )}
      </EmptyState>
    );
  }

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-5">
        <Steps
          steps={[
            t("الموسم والمزوّد", "Season and provider"),
            t("اختيار الخدمات", "Choose services"),
            t("مراجعة العقد", "Review the contract"),
          ]}
          current={picked.length === 0 ? 1 : 2}
        />

        <fieldset className="grid gap-4 rounded-2xl border border-border bg-card p-5">
          <legend className="px-2 text-sm font-bold">{t("على أي إنتاج؟", "For which production?")}</legend>

          <input type="hidden" name="unit_kind" value={unitKind} />

          {seasons.length > 0 && herds.length > 0 && (
            <div className="flex gap-2 text-sm">
              {(
                [
                  ["season", t("موسم زراعي", "Crop season")],
                  ["herd", t("دورة إنتاج حيواني", "Livestock cycle")],
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
              {t("الموسم", "Season")}
              <select
                name="unit_id"
                value={seasonId}
                onChange={(e) => setSeasonId(e.target.value)}
                className={field}
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {n0(s.feddans)} {t("فدان", "feddans")}
                  </option>
                ))}
              </select>
              <Explain tone="why">
                {t(
                  "الكميات في العقد تُحسب من هذا الموسم: المساحة بالفدان، والاحتياج المائي المشتق بمعادلة FAO-56، وتواريخ المراحل. لا تُكتب يدوياً، فيمكنك أنت والمزوّد إعادة حسابها.",
                  "The quantities in the contract are computed from this season: the area in feddans (1 feddan ≈ 0.42 ha), the water requirement derived with the FAO-56 method, and the phase dates. They are not typed in by hand, so you and the provider can both recompute them.",
                )}
              </Explain>
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              {t("الدورة", "Cycle")}
              <select
                name="unit_id"
                value={herdId}
                onChange={(e) => setHerdId(e.target.value)}
                className={field}
              >
                {herds.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} — {n0(h.head_count)} {t("رأس", "head")}
                  </option>
                ))}
              </select>
              <Explain tone="why">
                {t(
                  "الكميات تُحسب من هذه الدورة: عدد الرؤوس للخدمات البيطرية والتغذوية، وطول الدورة بالأشهر للمتابعة الدورية. الخدمات التي لا تنطبق على الإنتاج الحيواني تُسقَط من الخطة ولا تُسعَّر بصفر.",
                  "The quantities are computed from this cycle: the head count for veterinary and feeding services, and the cycle length in months for regular follow-up. Services that do not apply to livestock are dropped from the plan, not priced at zero.",
                )}
              </Explain>
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm">
            {t("مقدّم الخدمة", "Service provider")}
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
            {t("عنوان العقد", "Contract title")}
            <input
              name="title"
              required
              className={field}
              placeholder={t(
                "مثال: عقد إعداد الأرض — موسم الذرة ٢٠٢٦",
                "e.g. Land preparation contract — sorghum season 2026",
              )}
            />
          </label>
        </fieldset>

        <fieldset className="rounded-2xl border border-border bg-card p-5">
          <legend className="px-2 text-sm font-bold">{t("أي خدمات؟", "Which services?")}</legend>

          {providerOffers.length === 0 ? (
            <p className="text-sm text-muted">
              {t("لم يُدرج هذا المزوّد أي خدمة بعد.", "This provider has not listed any services yet.")}
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
                        <span className="font-medium">{locale === "en" ? def.nameEn : def.name}</span>
                        <span className="text-sm">
                          {n0(offer.price_per_unit)} /{" "}
                          {serviceUnitLabel(def.unit, locale)}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted">
                        {serviceNote(def, locale)}
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
        <h2 className="text-sm font-bold">{t("خطة العقد", "Contract plan")}</h2>

        {preview.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted">
            {t(
              "اختر خدمة لترى مراحل العقد وتواريخها ومبالغها محسوبة من موسمك.",
              "Choose a service to see the contract's phases, dates and amounts computed from your season.",
            )}
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
                      {m.seq}. {serviceName(m.serviceKey, locale, m.title)}
                    </span>
                    <span className="shrink-0 text-sm">{n0(m.amount)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {n0(m.quantity)} {serviceUnitLabel(m.unit, locale)} ×{" "}
                    {n0(m.unitPrice)}
                    {m.plannedStart && <> — {t("يبدأ", "starts")} {m.plannedStart}</>}
                  </p>
                </li>
              ))}
            </ol>

            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="font-bold">{t("الإجمالي", "Total")}</span>
              <span className="text-lg font-bold">{n0(total)}</span>
            </div>

            <Explain tone="why">
              {t(
                "كل مرحلة تُدفع وحدها بعد إثبات تنفيذها بصورة أو تقرير. لن يُفرَج عن دفعة قبل اعتماد مرحلتها، ولا تُعتمد مرحلة قبل التي قبلها.",
                "Each phase is paid on its own after proof of delivery by photo or report. No payment is released before its phase is approved, and no phase is approved before the one before it.",
              )}
            </Explain>
          </>
        )}

        <button
          type="submit"
          disabled={pending || preview.length === 0}
          className="mt-1 rounded-lg bg-primary px-6 py-2.5 font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? t("جارٍ الإنشاء...", "Creating...") : t("أنشئ العقد كمسودة", "Create the contract as a draft")}
        </button>

        <p className="text-xs text-muted">
          {t(
            "يُحفظ كمسودة — لا يلزم أحداً قبل أن يوقّعه الطرفان.",
            "Saved as a draft — it binds no one until both parties sign it.",
          )}
        </p>
      </aside>
    </form>
  );
}
