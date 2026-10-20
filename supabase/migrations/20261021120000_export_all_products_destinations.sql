-- ═══════════════════════════════════════════════════════════════════════════
-- ملفّ الصادر: المنتجُ منفصلٌ عن الوجهة، وكلُّ المنتجات والوجهات (البند ١١٨)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- طلب المالك (20 أكتوبر 2026): «أفصل المنتج المراد تصديره عن الوجهة التي يُصدَّر
-- إليها، وأضف كلّ المنتجات والوجهات».
--
-- كان العرضُ يختار «ممرّاً» واحداً من تسعة: سلعةً ووجهةً معاً، لا غير. فصار
-- المزارعُ يختار المنتجَ وحده والوجهةَ وحدها، والممرُّ يُنشأ عند أوّل عرضٍ على
-- الزوج (`export_corridor_for`). وما لم تُدرس شروطُه بعد يقول ذلك صراحةً في
-- صفحة العرض بدل أن يبدو «جاهزاً» لأنّه بلا قواعد.
--
-- **المنتجات** كما يعدّها بنك السودان في صادرات 2020–2025 (مراجعة الإحصاءات
-- الاقتصاديّة والماليّة، يناير–ديسمبر 2025، الجدول 7، والملخّص الجمركيّ للربع
-- الثالث 2025، الجدول 4)، عدا الذهب: صادرُه يمرّ بقواعد البنك المركزيّ وحدها،
-- وله صفحته في قسم التعدين.
--
-- **الوجهات** كلّ بلدٍ يسمّيه بنك السودان في التوزيع الجغرافيّ للصادرات
-- (الجدول 10 من المراجعة نفسها)، ومصرُ التي سمّتها وزارة الثروة الحيوانيّة أكبرَ
-- مشترٍ للماشية مع السعوديّة (30 مارس 2026)، والجيرانُ الذين تعبر إليهم
-- البضاعة برّاً، وبقيّةُ دول الخليج. وبلدانُ الاتحاد الأوروبيّ تبقى وجهةً
-- واحدة لأنّ شروطه واحدة.
--
-- ولا يُحذف شيء: الإضافة وحدها، وما كان موجوداً يبقى كما هو.

insert into export_commodities (code, name_ar, hs_code, default_uom_code) values
  ('cotton',       'القطن',                          '520100', 'ton'),
  ('melon_seeds',  'حبّ البطّيخ (التسالي)',          '120770', 'ton'),
  ('oilseed_cake', 'الأمباز (كسب البذور الزيتيّة)',   null,     'ton'),
  ('live_goats',   'الماعز الحيّ',                    '010420', 'head'),
  ('live_camels',  'الإبل الحيّة',                    '010613', 'head'),
  ('live_cattle',  'الأبقار الحيّة',                  '010229', 'head'),
  ('meat',         'اللحوم المبرّدة والمجمّدة',       null,     'ton'),
  ('hides_skins',  'الجلود',                          null,     'ton')
on conflict (code) do nothing;

insert into export_destinations (code, name_ar) values
  -- الخليج والدول العربيّة
  ('QA', 'قطر'), ('KW', 'الكويت'), ('OM', 'عُمان'), ('BH', 'البحرين'),
  ('YE', 'اليمن'), ('JO', 'الأردن'), ('SY', 'سوريا'), ('IQ', 'العراق'),
  ('LB', 'لبنان'), ('EG', 'مصر'), ('LY', 'ليبيا'),
  -- أفريقيا والجوار
  ('ET', 'إثيوبيا'), ('ER', 'إريتريا'), ('TD', 'تشاد'), ('SS', 'جنوب السودان'),
  ('KE', 'كينيا'), ('DJ', 'جيبوتي'),
  -- آسيا
  ('IN', 'الهند'), ('JP', 'اليابان'), ('KR', 'كوريا الجنوبيّة'), ('TH', 'تايلاند'),
  ('BD', 'بنغلاديش'), ('ID', 'إندونيسيا'), ('MY', 'ماليزيا'), ('VN', 'فيتنام'),
  -- أوروبا خارج الاتحاد، والأمريكتان
  ('GB', 'المملكة المتحدة'), ('RU', 'روسيا'),
  ('US', 'الولايات المتحدة'), ('BR', 'البرازيل')
on conflict (code) do nothing;

-- الممرّ لزوجٍ من منتجٍ ووجهة: الموجودُ إن وُجد، وإلّا يُنشأ بلا قواعد — وصفحةُ
-- العرض تقول إنّ شروطه لم تُدرس بعد، ولوحةُ الإدارة تعرضه لتُدرس.
create or replace function public.export_corridor_for(p_commodity uuid, p_destination uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if not exists (select 1 from export_commodities where id = p_commodity and active) then
    raise exception 'المنتج غير موجود';
  end if;
  if not exists (select 1 from export_destinations where id = p_destination and active) then
    raise exception 'الوجهة غير موجودة';
  end if;

  select id into cid from export_corridors
   where commodity_id = p_commodity and destination_id = p_destination;
  if cid is not null then
    if not exists (select 1 from export_corridors where id = cid and active) then
      raise exception 'هذا الطريق موقوفٌ من الإدارة';
    end if;
    return cid;
  end if;

  insert into export_corridors (commodity_id, destination_id)
  values (p_commodity, p_destination)
  on conflict (commodity_id, destination_id) do nothing
  returning id into cid;
  if cid is null then
    select id into cid from export_corridors
     where commodity_id = p_commodity and destination_id = p_destination;
  end if;
  return cid;
end $$;

revoke execute on function public.export_corridor_for(uuid, uuid) from public, anon;
grant execute on function public.export_corridor_for(uuid, uuid) to authenticated;
