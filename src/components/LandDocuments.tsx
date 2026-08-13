"use client";

import { useState } from "react";
import EvidenceUpload from "@/components/EvidenceUpload";
import {
  addLandDocument,
  LAND_DOCUMENT_KINDS,
} from "@/app/lands/documents/actions";

export default function LandDocuments({
  landId,
  existing,
}: {
  landId: string;
  existing: { id: string; kind: string; caption: string | null }[];
}) {
  const [uploaded, setUploaded] = useState<string[]>([]);

  const kindLabel = (k: string) =>
    LAND_DOCUMENT_KINDS.find((x) => x.value === k)?.label ?? k;

  const have = new Set([...existing.map((e) => e.kind), ...uploaded]);

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="mb-2 text-sm font-medium">مستندات الأرض</p>

      <ul className="mb-3 flex flex-wrap gap-2">
        {LAND_DOCUMENT_KINDS.map((k) => (
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
            <li key={e.id}>
              {kindLabel(e.kind)}
              {e.caption ? ` — ${e.caption}` : ""}
            </li>
          ))}
        </ul>
      )}

      <EvidenceUpload
        kinds={LAND_DOCUMENT_KINDS}
        folder="lands"
        label="ارفع المستند"
        onUploaded={async ({ kind, storagePath, caption }) => {
          const result = await addLandDocument({
            landId,
            kind,
            storagePath,
            caption,
          });
          if (result.ok) setUploaded((u) => [...u, kind]);
          return result;
        }}
      />
    </div>
  );
}
