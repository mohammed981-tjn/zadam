-- ═══════════════════════════════════════════════════════════════════════════
-- فئاتُ المساحة أربعٌ بقرار المالك (20 أكتوبر 2026، البند ١١٥)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- صغيرة: أقلّ من ٢٠ فداناً — حجمُ الحواشة القياسيّة في الجزيرة (٢٠ فداناً، و١٥
-- في المناقل: البنك الدولي، وجامعة السودان للعلوم والتكنولوجيا).
-- متوسّطة: ٢٠ إلى أقلّ من ٢٠٠.
-- كبيرة: ٢٠٠ إلى أقلّ من ١٠٠٠.
-- مشروعٌ آليّ: ١٠٠٠ فدان فأكثر — وحدةُ المشاريع الآليّة المخطّطة (١٠٠٠ و١٥٠٠
-- فدان: Ahmed & Elsaied 2017، «Status of Agricultural Statistics in Sudan»).
--
-- يُغيَّر الحدُّ هنا وفي src/lib/partners.ts معاً.

create or replace function public.land_area_band(p_feddans numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_feddans is null then null
    when p_feddans < 20 then 'small'
    when p_feddans < 200 then 'medium'
    when p_feddans < 1000 then 'large'
    else 'scheme'
  end;
$$;

revoke execute on function public.land_area_band(numeric) from public, anon;
grant execute on function public.land_area_band(numeric) to authenticated;

-- الاتّفاقُ يقبل الفئةَ الرابعة. لا اتّفاقَ قائماً يتغيّر معناه إلّا «كبيرة»: كانت
-- ٢٠٠ فأكثر وصارت ٢٠٠ إلى أقلّ من ١٠٠٠، ولم يكن على الإنتاج اتّفاقٌ يوم الكتابة.
alter table public.partner_agreements drop constraint partner_agreements_area_bands_check;
alter table public.partner_agreements add constraint partner_agreements_area_bands_check
  check (area_bands <@ array['small','medium','large','scheme']);
