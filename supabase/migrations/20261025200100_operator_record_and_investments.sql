-- سجلّ المنفّذ يعدّ ما جرى، والاستثمار المؤكَّد لا يُعاد تأكيده (البند ١٩٨: د٤ ود٥).
--
-- د٤ — «المواسم المكتملة» كانت تُعدّ من كلّ موسمٍ مُقفل، والمزارع يُنشئ موسماً ويُقفله بلا مرحلةٍ ولا شيء: خمسة
--      مواسم فارغة رفعت السجلّ من ١ إلى ٦. القاعدة الآن: **يُعدّ الموسم المُقفل مكتملاً إن اعتُمدت فيه مرحلةٌ
--      واحدةٌ على الأقلّ بدليلٍ مرفوع** (ملفٌّ في التخزين)، أي أنّ ما جرى فيه رآه أحدٌ غير صاحبه. والموسم الفارغ
--      يبقى في صفحة صاحبه ولا يدخل سجلّه الذي يراه المستثمرون. ونسبة الالتزام كما كانت، ولم يعد حذف مراحل موسمٍ
--      بدأ أو أُقفل ممكناً (20261025200000) فلا تُنفخ بها.
-- د٥ — كان المدير يُرجع استثماراً مؤكَّداً إلى «قيد الانتظار» أو «ملغى» بتحديثٍ مباشر، فلا يُنقص المباع؛ ثمّ يؤكّده
--      من جديد فتُعدّ حصصه مرّتين (٣ حصص صارت ٦). الآن لا يخرج طلبٌ من «مؤكَّد» بتحديثٍ مباشر لأحد. وإلغاء
--      استثمارٍ مؤكَّد (ردّ المال وإعادة الحصص) عملٌ لم يُبنَ بعد؛ يُبنى دالّةً تُنقص المباع وتكتب السجلّ.

create or replace function public.refresh_operator_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  done int;
  total_stages int;
  signed_stages int;
begin
  if new.status = 'completed' and coalesce(old.status,'') <> 'completed' then
    select count(*) into done from seasons s
      where s.owner_id = new.owner_id and s.status = 'completed'
        and exists (select 1 from season_stages st
                     where st.season_id = s.id and st.completed
                       and exists (select 1 from stage_evidence e
                                    where e.stage_id = st.id and e.storage_path is not null));

    select count(*), count(*) filter (where completed)
      into total_stages, signed_stages
      from season_stages st join seasons s on s.id = st.season_id
      where s.owner_id = new.owner_id;

    perform set_config('app.operator_record', '1', true);

    update profiles
      set completed_seasons = done,
          reporting_rate = case when total_stages > 0
                                then round((signed_stages::numeric / total_stages), 2)
                                else 0 end
      where id = new.owner_id;

    perform set_config('app.operator_record', '', true);
  end if;
  return new;
end $$;

create or replace function public.investment_keep_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if new.project_id is distinct from old.project_id
       or new.investor_id is distinct from old.investor_id
       or new.shares is distinct from old.shares
       or new.amount is distinct from old.amount then
      raise exception 'لا يُعدَّل طلبُ استثمارٍ بعد رفعه.';
    end if;
    if new.status = 'confirmed' and old.status is distinct from 'confirmed'
       and coalesce(current_setting('app.confirming_investment', true), '') <> '1' then
      raise exception 'يُؤكَّد الاستثمار بدالّة التأكيد وحدها.';
    end if;
    -- Leaving «confirmed» by hand kept its shares sold, and a second confirmation counted them again.
    if old.status = 'confirmed' and new.status is distinct from 'confirmed' then
      raise exception 'استثمارٌ أُكِّد لا يُرجَع ولا يُلغى بتحديثٍ مباشر: حصصه محسوبةٌ في المباع.';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.refresh_operator_record() from public, anon, authenticated;
revoke execute on function public.investment_keep_gate() from public, anon, authenticated;
