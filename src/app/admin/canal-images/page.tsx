import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CanalImageUpload from "@/components/CanalImageUpload";
import { publicMediaUrl } from "@/lib/media";
import type { ArcCanalImage } from "@/types/database";
import {
  recordCanalImage,
  updateCanalImage,
  deleteCanalImage,
} from "./actions";

export const metadata = { title: "صور القناة القوسية | سودجري" };
export const dynamic = "force-dynamic";

/**
 * The canal page's picture desk.
 *
 * Upload, caption, credit, order, publish, delete — in one screen, because
 * they are one job. An image arrives unpublished and stays that way until
 * somebody ticks the box, so nothing reaches the public page by the act of
 * uploading it.
 */
export default async function AdminCanalImagesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Same gate as every other admin screen: checked here so the page never
  // renders for a non-admin, and enforced again by RLS on every write.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

  const { data } = await supabase
    .from("arc_canal_images")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  const images = (data ?? []) as ArcCanalImage[];
  const published = images.filter((i) => i.published).length;

  const field =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">صور صفحة القناة القوسية</h1>
        <p className="leading-relaxed text-muted">
          {images.length} صورة، منها {published} منشورة. ولا تُنشر صورة بلا
          مصدرٍ مذكور — الصفحة كلّها مبنيّة على أن لكل ما فيها سنداً، والصورة
          ليست استثناءً.
        </p>
      </header>

      {message && (
        <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">أضف صورة</h2>
        <CanalImageUpload onUploaded={recordCanalImage} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">الصور المرفوعة</h2>

        {images.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm leading-relaxed text-muted">
            لا صور بعد. أضف واحدة من الأعلى.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {images.map((img) => (
              <li
                key={img.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row"
              >
                {/*
                  A plain img, not next/image: the bucket is an external origin
                  and the optimiser would need a remotePatterns entry allowing
                  it. These are a handful of already-compressed illustrations on
                  one page, so the optimiser buys nothing worth widening the
                  image config for.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={publicMediaUrl(img.storage_path)}
                  alt={img.caption}
                  className="h-32 w-full shrink-0 rounded-lg object-cover sm:w-48"
                />

                <form
                  action={updateCanalImage}
                  className="flex flex-1 flex-col gap-2"
                >
                  <input type="hidden" name="image_id" value={img.id} />

                  <input
                    name="caption"
                    defaultValue={img.caption}
                    className={field}
                    placeholder="الوصف"
                  />

                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      name="credit"
                      defaultValue={img.credit}
                      className={field}
                      placeholder="المصدر أو المُلتقِط"
                    />
                    <input
                      name="source_url"
                      defaultValue={img.source_url ?? ""}
                      className={field}
                      placeholder="https://…"
                      dir="ltr"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-muted">الترتيب</span>
                      <input
                        name="sort_order"
                        type="number"
                        defaultValue={img.sort_order}
                        className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm"
                      />
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        name="published"
                        type="checkbox"
                        defaultChecked={img.published}
                      />
                      منشورة
                    </label>

                    <button
                      type="submit"
                      className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                    >
                      احفظ
                    </button>

                    {img.taken_on && (
                      <span className="text-xs text-muted">
                        التُقطت {img.taken_on}
                      </span>
                    )}
                  </div>
                </form>

                <form action={deleteCanalImage} className="sm:self-start">
                  <input type="hidden" name="image_id" value={img.id} />
                  <input
                    type="hidden"
                    name="storage_path"
                    value={img.storage_path}
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-danger/40 px-3 py-1.5 text-sm text-danger hover:bg-danger/5"
                  >
                    حذف
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
