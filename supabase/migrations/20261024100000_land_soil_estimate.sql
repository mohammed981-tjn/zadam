-- ═══════════════════════════════════════════════════════════════════════════
-- تربة موقع الأرض نفسه، ومن أين جاءت (البند ١٨٠، MAP-1 من تقرير الفحص)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `lands.soil_class` كان يُملأ من خريطة التربة الوطنيّة: صنفُ مربّعٍ عرضُه ١٦٠ كم.
-- فيرى المستثمر «تربة الأرض» وهي تربةُ المربّع، وهي خاطئة في وادي النيل حيث
-- الطمي شريطٌ ضيّق وسط الرمل. القراءة الجديدة من SoilGrids عند إحداثيّة الأرض
-- (٢٥٠ م)، ومعها احتمالُ الصنف، فإن كان ضعيفاً قالت الصفحة إنه غير مؤكَّد.
--
-- ما في هذه الهجرة:
--   - عمودان: `soil_source` («point» حين قرأه التطبيق عند الإحداثيّة، وفارغ فيما سواه)
--     و`soil_pct` (احتمال الصنف ٪). لا يكتبهما أحدٌ إلّا الدالّة `land_set_soil_estimate`:
--     مالك الأرض لا يستطيع أن يضع «تقدير من الأقمار» على صنفٍ كتبه بيده.
--   - الدالّة تكتب الصنف ومصدره واحتماله معاً. وهي لا تعيد الأرض الموثّقة إلى المراجعة:
--     قراءةٌ آليّة ليست ادّعاءً من المالك، فلا يُعاد توثيق أرضٍ لأنّ الأقمار أجابت.
--     أمّا تعديلُ المالك للصنف بيده فيبقى يعيدها كما كان.
--   - من يحرّك الأرض (إحداثيّات جديدة) تسقط عنه قراءة المكان القديم.
--   - دالّة قراءةٍ جديدة للأراضي المعروضة على المستثمرين، تُرجع المصدر والاحتمال دون
--     المساس بـ`investor_open_lands` ولا بتوقيعها.
--
-- لا يُحذف شيء: الأصناف المخزَّنة قبل اليوم تبقى كما هي ومصدرها فارغ، فتُعرض بوسم
-- «تقدير عامّ للمنطقة» لا بوسم «تقدير لموقع الأرض».

alter table public.lands
  add column if not exists soil_source text
    check (soil_source is null or soil_source = 'point'),
  add column if not exists soil_pct smallint
    check (soil_pct is null or soil_pct between 0 and 100);

comment on column public.lands.soil_source is
  'point = صنف التربة قرأه التطبيق من SoilGrids عند إحداثيّة الأرض؛ فارغ = غير ذلك (كان من خريطة المربّعات أو من المالك). لا يكتبه إلا land_set_soil_estimate.';
comment on column public.lands.soil_pct is
  'احتمال صنف التربة ٪ كما أعادته SoilGrids عند القراءة. فارغ إن لم تكن القراءة عند الإحداثيّة.';

-- ── الكتابة: دالّة واحدة ────────────────────────────────────────────────────

create function public.land_set_soil_estimate(p_land uuid, p_class text, p_pct integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found boolean;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if p_class is null or p_class !~ '^[A-Z][a-z]{3,20}$' then
    raise exception 'صنف تربة غير صالح';
  end if;
  if p_pct is null or p_pct < 0 or p_pct > 100 then
    raise exception 'احتمال التربة بين ٠ و١٠٠';
  end if;

  -- The triggers below let this one write through; nothing else does.
  perform set_config('sudagri.soil_estimate', '1', true);
  update public.lands
     set soil_class = p_class, soil_source = 'point', soil_pct = p_pct
   where id = p_land and (owner_id = auth.uid() or is_admin());
  v_found := found;
  perform set_config('sudagri.soil_estimate', '', true);

  if not v_found then
    raise exception 'ليست لك هذه الأرض';
  end if;
end $$;

revoke execute on function public.land_set_soil_estimate(uuid, text, integer) from public, anon;
grant execute on function public.land_set_soil_estimate(uuid, text, integer) to authenticated;

-- ── الحراسة: المصدر لا يُدَّعى، والمكان إن تحرّك سقطت قراءته ────────────────

create function public.lands_soil_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_machine boolean := coalesce(current_setting('sudagri.soil_estimate', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if not v_machine then
      new.soil_source := null;
      new.soil_pct := null;
    end if;
    return new;
  end if;

  if not v_machine then
    -- A direct write cannot claim a satellite reading…
    if (new.soil_source, new.soil_pct) is distinct from (old.soil_source, old.soil_pct) then
      new.soil_source := old.soil_source;
      new.soil_pct := old.soil_pct;
    end if;
    -- …and a class typed by hand is no longer the reading it replaced.
    if new.soil_class is distinct from old.soil_class then
      new.soil_source := null;
      new.soil_pct := null;
    end if;
    -- A reading of the old place is wrong for the new one.
    if old.soil_source = 'point'
       and (new.latitude is distinct from old.latitude or new.longitude is distinct from old.longitude) then
      new.soil_class := null;
      new.soil_source := null;
      new.soil_pct := null;
    end if;
  end if;
  return new;
end $$;

revoke execute on function public.lands_soil_provenance() from public, anon, authenticated;

-- Fires after lands_reopen_on_fact_change (by name), which therefore sees the owner's own change.
create trigger lands_soil_provenance
  before insert or update on public.lands
  for each row execute function public.lands_soil_provenance();

-- ── التوثيق: قراءة الأقمار ليست ادّعاء المالك ───────────────────────────────
-- The body is the one in 20261023030000_entry_and_land_facts.sql, word for word, but for the soil
-- line: a change of soil_class that the satellite reading made (the handshake above) and that did
-- not touch the owner's own note does not send a verified land back to review.

create or replace function public.reopen_land_on_fact_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[];
  v_machine boolean := coalesce(current_setting('sudagri.soil_estimate', true), '') = '1';
begin
  if old.verification <> 'verified' then return new; end if;
  if auth.uid() is null or is_admin() then return new; end if;

  v_changed := array_remove(array[
    case when new.latitude is distinct from old.latitude
           or new.longitude is distinct from old.longitude then 'الموقع' end,
    case when (new.state, new.locality, new.village)
           is distinct from (old.state, old.locality, old.village) then 'الولاية أو المحلّيّة أو القرية' end,
    case when new.feddans is distinct from old.feddans then 'المساحة' end,
    case when (new.water_source, new.water_per_feddan)
           is distinct from (old.water_source, old.water_per_feddan) then 'الماء' end,
    case when (new.soil_class, new.soil_note)
           is distinct from (old.soil_class, old.soil_note)
          and not (v_machine and new.soil_note is not distinct from old.soil_note) then 'التربة' end,
    case when new.tenure is distinct from old.tenure then 'نوع الحيازة' end
  ], null);

  if cardinality(v_changed) = 0 then return new; end if;

  new.verification := 'submitted';
  new.listed := false;
  new.verification_note := 'عُدِّل بعد التوثيق: ' || array_to_string(v_changed, '، ')
                           || '. تُراجَع الأرض من جديد قبل أن تُعرض.';

  perform notify_user(new.owner_id, 'land_submitted',
    'عادت أرضك إلى المراجعة',
    format('غيّرتَ %s في الأرض "%s" بعد توثيقها، فلا تُعرض حتى تراجعها الإدارة من جديد.',
           array_to_string(v_changed, '، '), coalesce(new.name, 'أرضك')),
    '/lands');
  return new;
end;
$$;

revoke execute on function public.reopen_land_on_fact_change() from public, anon;

-- ── القراءة للمستثمرين: المصدر والاحتمال ────────────────────────────────────

create function public.land_soil_estimates(p_ids uuid[])
returns table (land_id uuid, soil_class text, soil_source text, soil_pct integer)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.soil_class, l.soil_source, l.soil_pct::integer
    from lands l
   where l.id = any (coalesce(p_ids, '{}'))
     and l.verification = 'verified'
     and l.open_to_investors
     and cardinality(l.investor_models) > 0
   limit 500;
$$;

revoke execute on function public.land_soil_estimates(uuid[]) from public;
grant execute on function public.land_soil_estimates(uuid[]) to anon, authenticated;
