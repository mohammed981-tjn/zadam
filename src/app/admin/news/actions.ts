"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const orNull = (v: string) => (v.length > 0 ? v : null);

/**
 * الصفحاتُ التي يمسّها خبر.
 *
 * `/news` is the list and `/` carries the strip, and both are cached — so a
 * write that does not invalidate them is a write the owner cannot see, and the
 * first thing he will do is write it again.
 */
function refresh() {
  revalidatePath("/admin/news");
  revalidatePath("/news");
  revalidatePath("/");
}

/** يُعاد إلى الشاشة بالسبب الذي رفعته القاعدة، لا برسالةٍ عامّة. */
function back(error?: string): never {
  redirect(error ? `/admin/news?error=${encodeURIComponent(error)}` : "/admin/news");
}

export async function saveAnnouncement(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");

  const row = {
    title: str(formData, "title"),
    body: str(formData, "body"),
    summary: orNull(str(formData, "summary")),
    link_path: orNull(str(formData, "link_path")),
    link_label: orNull(str(formData, "link_label")),
  };

  if (row.title.length < 3) back("العنوان قصير جداً.");
  if (row.body.length < 20) back("النصّ قصير جداً — اكتب عشرين حرفاً على الأقلّ.");

  /*
   * والرابطُ واسمُه معاً أو لا واحدَ منهما.
   *
   * The database says the same thing in a CHECK, and it is the boundary. This
   * repeats it only so the message names the field: a constraint violation
   * arrives as `announcement_link_is_whole`, which tells the owner nothing.
   */
  if ((row.link_path === null) !== (row.link_label === null)) {
    back("الرابط واسمه يُكتبان معاً أو يُتركان معاً.");
  }

  const query = id
    ? supabase.from("announcements").update(row).eq("id", id).select("id")
    : supabase
        .from("announcements")
        // `created_by` يكتبه الزنادُ من الجلسة، ويُرسَل هنا لأنّ العمودَ
        // `not null` والزنادُ يعمل بعد فحص القيد لا قبله.
        .insert({ ...row, created_by: (await supabase.auth.getUser()).data.user?.id })
        .select("id");

  const { data, error } = await query;

  if (error) back(error.message);
  // ورفضُ سياسة الصفوف لا يرفع خطأً: صفٌّ لم يُمسّ هو «لست مديراً»، لا نجاح.
  if ((data ?? []).length === 0) back("لم يُحفظ شيء — الكتابة من صلاحية الإدارة.");

  refresh();
  back();
}

/**
 * ينشر أو يسحب من النشر.
 *
 * A single action for both directions rather than two, because the decision is
 * one column and splitting it would put the rule in two places. `published_at`
 * carries the moment as well as the state: taking a notice down and putting it
 * back gives it a new date, which is honest — it is being published again.
 */
export async function setAnnouncementPublished(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  const publish = str(formData, "publish") === "1";

  if (!id) back();

  const { data, error } = await supabase
    .from("announcements")
    .update({ published_at: publish ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");

  if (error) back(error.message);
  if ((data ?? []).length === 0) back("لم يتغيّر شيء — النشر من صلاحية الإدارة.");

  refresh();
  back();
}

/**
 * يحذف — والمسوّدةَ وحدها.
 *
 * A published notice that turned out wrong is unpublished, not deleted: people
 * have read it, and the correction is part of the record. Deleting is for the
 * draft nobody ever saw.
 */
export async function deleteAnnouncement(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "id");
  if (!id) back();

  const { data, error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", id)
    .is("published_at", null)
    .select("id");

  if (error) back(error.message);
  if ((data ?? []).length === 0) {
    back("لم يُحذف شيء — المنشورُ يُسحب من النشر ولا يُمحى.");
  }

  refresh();
  back();
}
