-- مراحل الموسم والمواسم ودليل العقود (البند ١٩٨: د٣ ود٤ ود٦).
--
-- د٣ — تخطّي مرحلةٍ بحذف المفتوحة قبلها. حارس الحذف (20261024010000) كان يرفض حذف مرحلةٍ قبل مرحلةٍ *معتمدة*
--      فقط، فالمراحل ١ معتمدة و٢ و٣ مفتوحتان: يُحذف ٢، ثمّ يُعتمد ٣ «بلا مفتوحٍ قبله». الآن: موسمٌ اعتُمدت فيه
--      مرحلةٌ واحدة، أو أُقفل، خطّتُه ثابتة — لا تُحذف منه مرحلة. وما لم يبدأ بعدُ تُحذف مراحله كما كانت (ويُسحب
--      الموسم كلّه حين يفشل حفظ مراحله، كما يفعل التطبيق).
-- د٤ — موسمٌ يُدرَج «مُقفلاً» مباشرةً. حارس التاريخ يعمل على التعديل والحذف وحدهما، فيُدرَج موسمٌ مُقفلٌ بحصادٍ
--      مكتوب في خطوةٍ واحدة: يرفع سجلّ المنفّذ ويتخطّى ترحيل الإقفال إلى دفتر المزرعة. الآن يُدرَج الموسم جارياً.
--      (وقاعدة العدّ نفسها في 20261025200100.)
-- د٦ — دليل مرحلة العقد بلا حارس إدراج. كان يُقبل مسارٌ في مجلّد الطرف الآخر لملفٍّ لم يُرفع قطّ، وباسمه، وعلى
--      مرحلةٍ وُوفق عليها، ثمّ يمنع حارسُ البقاء حذفَه. الآن بقاعدة دليل المرحلة نفسها: في مجلّدك، والملفّ موجود،
--      والكاتب هو أنت، ولا يُضاف دليلٌ إلى مرحلةٍ وُوفق عليها.

create or replace function public.season_stage_delete_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() then
    if old.completed
       or exists (select 1 from stage_evidence where stage_id = old.id)
       or exists (select 1 from season_stages s where s.season_id = old.season_id and s.completed)
       or exists (select 1 from seasons where id = old.season_id and status = 'completed') then
      raise exception 'خطّة موسمٍ بدأ اعتماد مراحله ثابتة: لا تُحذف منه مرحلة.';
    end if;
  end if;
  return old;
end;
$$;

create or replace function public.seasons_insert_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() and new.status is distinct from 'active' then
    raise exception 'يبدأ الموسم جارياً، ويُقفل بعد مراحله.';
  end if;
  return new;
end;
$$;

create trigger seasons_insert_gate
  before insert on public.seasons
  for each row execute function public.seasons_insert_gate();

create or replace function public.milestone_evidence_insert_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() then
    if exists (select 1 from contract_milestones where id = new.milestone_id and approved_at is not null) then
      raise exception 'مرحلةُ عقدٍ وُوفق عليها: لا يُضاف إلى دليلها.';
    end if;
    if new.storage_path is not null then
      if new.storage_path not like auth.uid()::text || '/%' or new.storage_path like '%..%' then
        raise exception 'مسار الملفّ ليس في مجلّدك.';
      end if;
      if to_regclass('storage.objects') is not null
         and not exists (select 1 from storage.objects
                          where bucket_id = 'evidence' and name = new.storage_path) then
        raise exception 'لم نجد الملفّ المرفوع. ارفعه ثمّ سجّله.';
      end if;
    end if;
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger milestone_evidence_insert_gate
  before insert on public.milestone_evidence
  for each row execute function public.milestone_evidence_insert_gate();

revoke execute on function public.season_stage_delete_gate() from public, anon, authenticated;
revoke execute on function public.seasons_insert_gate() from public, anon, authenticated;
revoke execute on function public.milestone_evidence_insert_gate() from public, anon, authenticated;
