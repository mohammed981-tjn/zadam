"use client";

import { useState } from "react";
import EvidenceUpload from "@/components/EvidenceUpload";
import { addLandDocument } from "@/app/lands/documents/actions";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import {
  LAND_DOCUMENT_KINDS,
  LAND_DOCUMENT_KIND_EN,
} from "@/lib/landDocuments";

export default function LandDocuments({
  landId,
  existing,
}: {
  landId: string;
  existing: { id: string; kind: string; caption: string | null }[];
}) {
  const [uploaded, setUploaded] = useState<string[]>([]);
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const kinds =
    locale === "en"
      ? LAND_DOCUMENT_KINDS.map((k) => ({
          ...k,
          label: LAND_DOCUMENT_KIND_EN[k.value] ?? k.label,
        }))
      : LAND_DOCUMENT_KINDS;

  const kindLabel = (k: string) =>
    kinds.find((x) => x.value === k)?.label ?? k;

  const have = new Set([...existing.map((e) => e.kind), ...uploaded]);

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="mb-2 text-sm font-medium">
        {t("مستندات الأرض", "Land documents")}
      </p>

      <ul className="mb-3 flex flex-wrap gap-2">
        {kinds.map((k) => (
          <li
            key={k.value}
            className={`rounded-full px-3 py-1 text-xs ${
              have.has(k.value)
                ? "bg-primary/10 text-primary"
                : "border border-border text-muted"
            }`}
          >
            {have.has(k.value) ? "✓ " : ""}
            {k.label}
          </li>
        ))}
      </ul>

      {existing.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1 text-xs text-muted">
          {existing.map((e) => (
            // A caption left empty is the file's own name, and a phone names
            // a screenshot with one long unbroken word that pushed the whole
            // page sideways and the bottom bar off the screen (backlog 123).
            <li key={e.id} className="[overflow-wrap:anywhere]">
              {kindLabel(e.kind)}
              {e.caption && (
                <>
                  {" — "}
                  <span {...(locale === "en" ? { lang: "ar", dir: "rtl" } : {})}>
                    {e.caption}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <EvidenceUpload
        kinds={kinds}
        folder="lands"
        label={t("ارفع المستند", "Upload document")}
        offline={{ key: `land:${landId}`, label: t("مستند أرض", "Land document") }}
        onUploaded={async ({ kind, storagePath, caption, metadata }) => {
          const result = await addLandDocument({
            landId,
            kind,
            storagePath,
            caption,
            metadata,
          });
          if (result.ok) setUploaded((u) => [...u, kind]);
          return result;
        }}
      />
    </div>
  );
}
