"use client";

import { useActionState, useState } from "react";
import Explain from "@/components/Explain";
import {
  SERVICE_CATALOGUE,
  SERVICE_BY_KEY,
  serviceUnitLabel,
  serviceNote,
  type ServiceKey,
} from "@/lib/services";
import { addServiceOffer, type ActionResult } from "@/app/services/actions";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";

const field =
  "rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary";

export default function OfferForm({
  providerId,
  existing,
}: {
  providerId: string;
  /** Service keys already listed, so the same one is not offered twice. */
  existing: ServiceKey[];
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(addServiceOffer, null);
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const available = SERVICE_CATALOGUE.filter((d) => !existing.includes(d.key));
  const [serviceKey, setServiceKey] = useState<ServiceKey>(
    available[0]?.key ?? "drone_survey",
  );

  const def = SERVICE_BY_KEY[serviceKey];

  if (available.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted">
        {t("أدرجت كل الخدمات المعرّفة في الكتالوج.", "You have listed every service defined in the catalogue.")}
      </p>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
    >
      <h2 className="text-sm font-bold">{t("أضف خدمة إلى عروضك", "Add a service to your offers")}</h2>
      <input type="hidden" name="provider_id" value={providerId} />

      <label className="flex flex-col gap-1 text-sm">
        {t("الخدمة", "Service")}
        <select
          name="service_key"
          value={serviceKey}
          onChange={(e) => setServiceKey(e.target.value as ServiceKey)}
          className={field}
        >
          {available.map((d) => (
            <option key={d.key} value={d.key}>
              {locale === "en" ? d.nameEn : d.name}
            </option>
          ))}
        </select>
      </label>

      {def && (
        <Explain tone="why">
          {/* The unit is not a field, and the reason is worth one sentence:
              a provider free to pick the unit could break the one property
              that makes a contract checkable by both sides. */}
          {t("تُسعَّر بـ", "Priced per ")}<strong>{serviceUnitLabel(def.unit, locale)}</strong> — {serviceNote(def, locale)}{" "}
          {t(
            "الوحدة ثابتة في الكتالوج لأن الكمية تُشتق منها آلياً من موسم العميل، فيستطيع الطرفان إعادة حسابها.",
            "The unit is fixed in the catalogue because the quantity is derived from it automatically from the customer's season, so both parties can recompute it.",
          )}
        </Explain>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          {t("السعر لكل", "Price per")} {def ? serviceUnitLabel(def.unit, locale) : t("وحدة", "unit")}
          <input
            name="price_per_unit"
            type="number"
            min={0}
            step="any"
            required
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t("مهلة البدء (أيام)", "Lead time (days)")}
          <input
            name="lead_time_days"
            type="number"
            min={0}
            max={365}
            defaultValue={0}
            className={field}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        {t("وصف مختصر", "Short description")}
        <textarea
          name="description"
          rows={2}
          className={field}
          placeholder={t(
            "المعدّات المستخدمة، وما يشمله السعر وما لا يشمله.",
            "The equipment used, and what the price does and does not include.",
          )}
        />
      </label>

      {state && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            state.ok
              ? "border-primary/40 bg-primary/5"
              : "border-danger/40 bg-danger/5"
          }`}
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-primary px-6 py-2 font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? t("جارٍ الإضافة...", "Adding...") : t("أضف الخدمة", "Add service")}
      </button>
    </form>
  );
}
