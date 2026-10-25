-- رسائل الشراكة قبل القبول، وعنوانها بعد الرفض (البند ١٩٨: د٨، وملاحظة تقرير ما يراه كلّ واحد).
--
-- د٨ — منع كتابة الهاتف قبل قبول صاحب الأرض كان يُتجاوز بفواصل لم يعدّها فاصلاً: «0912/345/678» و«0912,345,678»
--      و«0912.345.678» تمرّ، وكذلك «osman at gmail dot com». الآن تُطبَّع الأرقام (العربيّة والفارسيّة إلى
--      اللاتينيّة)، وتُضمّ مجموعاتها التي تفصلها فواصل (مسافة . , / \ - _ ( ) | * ، ٫ ٬ وما شابه)، ثمّ يُفحص كلّ
--      عددٍ كاملٍ على هيئة رقم هاتف: ٠٩ أو ٠١ وثمانية أرقام، أو ٩ وثمانية، أو ٢٤٩ قبلها، أو «+» أو «00» وعشرة
--      أرقامٍ فأكثر. فلا يُمنع عددٌ عاديّ: كمّيّة، أو سعرٌ بالملايين، أو تاريخ (١٥/١٠/٢٠٢٦)، أو ساعة.
--      والوسائل الأخرى (واتساب وتلغرام والبريد) كما كانت، ومعها أسماء خدمات البريد وكتابة «at … dot com».
--      (ولا يُفحص ما في الصور المرفقة: القناة تراقبها الإدارة، وهذا باقٍ كما كان.)
-- العنوان — المستثمر الذي رُفض طلبه أو سحبه كان يرى اسم الأرض في عنوان المحادثة؛ صار يراه كما قبل القبول:
--      «طلب شراكة على أرضٍ في <الولاية>». واسمها له بعد القبول أو العقد وحدهما.

create or replace function public._looks_like_contact(p_text text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := translate(coalesce(p_text, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  r text;
begin
  -- Other channels, and an address spelled out.
  if v ~* '(واتس|وتساب|واتساب|whats ?app|تلغرام|تليجرام|تيليجرام|telegram|@|gmail|yahoo|hotmail|outlook|icloud|جيميل|ياهو|هوتميل)'
     or v ~* '\m(at|ات)\M.{1,40}\m(dot|نقطة|دوت)\M' then
    return true;
  end if;
  -- One number written in pieces is one number: groups of digits joined across the separators people use for phones.
  v := regexp_replace(v, '([0-9])[[:space:].,/\\_()|*،٫٬‐‑–—-]+(?=[0-9+])', '\1', 'g');
  for r in select m[1] from regexp_matches(v, '(\+?[0-9]+)', 'g') as m loop
    if r ~ '^(\+|00)?249[19][0-9]{8}$'       -- Sudan, with its country code
       or r ~ '^0[19][0-9]{8}$'             -- Sudan, as dialled at home
       or r ~ '^9[0-9]{8}$'                 -- the same without its leading zero
       or r ~ '^(\+|00)[0-9]{10,14}$' then   -- any other country
      return true;
    end if;
  end loop;
  return false;
end $$;

revoke execute on function public._looks_like_contact(text) from public, anon, authenticated;

create or replace function public.conversation_send(
  p_conv uuid, p_body text, p_attachment_path text default null, p_attachment_kind text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_conv conversations;
  v_status text;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_party uuid;
  v_link text;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  v_role := conversation_role(p_conv);
  if v_role is null then raise exception 'لستَ طرفاً في هذه المحادثة.'; end if;
  if length(v_body) = 0 and p_attachment_path is null then raise exception 'اكتب رسالتك.'; end if;
  if length(v_body) > 2000 then raise exception 'الرسالة أطول من ٢٠٠٠ حرف.'; end if;
  -- A file is the sender's own: the upload went to their folder, and nobody
  -- attaches another person's file by naming its path.
  if p_attachment_path is not null then
    if p_attachment_path not like auth.uid()::text || '/messages/%' or p_attachment_path like '%..%'
       or coalesce(p_attachment_kind, '') not in ('photo','document') then
      raise exception 'الملفّ المرفق غير صالح. ارفعه من جديد.';
    end if;
  end if;

  select * into v_conv from conversations where id = p_conv for update;

  if v_conv.kind = 'market' and not market_conversation_open(v_conv.market_offer_id) then
    raise exception 'انتهى هذا العرض منذ أكثر من ثلاثين يوماً، فلا رسائل جديدة فيه. ما كُتب يبقى محفوظاً.';
  end if;

  if v_conv.kind = 'partnership' then
    select status into v_status from investor_interests where id = v_conv.interest_id;
    if v_status in ('declined','withdrawn')
       and not exists (select 1 from partnership_agreements where interest_id = v_conv.interest_id) then
      raise exception 'أُغلق هذا الطلب، فلا رسائل جديدة فيه. ما كُتب يبقى محفوظاً.';
    end if;
    -- Before acceptance the number is not the chat's to reveal.
    if v_status = 'pending' and v_role <> 'admin' then
      if public._looks_like_contact(v_body) then
        raise exception 'لا يُكتب رقم هاتفٍ ولا وسيلة تواصلٍ أخرى قبل أن يقبل صاحب الأرض الطلب. بعد القبول يظهر الهاتف لكلٍّ منكما.';
      end if;
    end if;
  end if;

  insert into conversation_messages (conversation_id, sender_id, sender_role, body, attachment_path, attachment_kind)
  values (p_conv, auth.uid(), case v_role when 'admin' then 'platform' else v_role end, v_body,
          p_attachment_path, case when p_attachment_path is not null then p_attachment_kind end)
  returning id into v_id;

  update conversations
     set last_message_at = now(),
         needs_reply = case when kind = 'support' then v_role = 'member' else false end
   where id = p_conv;
  insert into conversation_reads (conversation_id, user_id, last_read_at) values (p_conv, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;

  -- One unread notice per conversation is enough: a second message while the
  -- first notice is still unread does not ring the bell again.
  v_link := '/messages/' || p_conv;
  for v_party in select * from conversation_others(p_conv) loop
    if not exists (select 1 from notifications n
                    where n.recipient_id = v_party and n.kind = 'message'
                      and n.link = v_link and n.read_at is null) then
      perform notify_user(v_party, 'message',
        case v_conv.kind when 'support' then 'ردّت عليك إدارة سوداقري'
                         when 'market' then 'رسالةٌ عن عرض «' || (select crop from market_offers where id = v_conv.market_offer_id) || '» في السوق'
                         else 'رسالةٌ جديدة في طلب الشراكة' end,
        coalesce(nullif(left(v_body, 140), ''), case p_attachment_kind when 'photo' then 'صورة' else 'مستند' end), v_link);
    end if;
  end loop;

  if v_conv.kind = 'support' and v_role = 'member' then
    perform notify_admins('message', 'رسالةٌ إلى سوداقري',
      coalesce(nullif(left(v_body, 140), ''), case p_attachment_kind when 'photo' then 'صورة' else 'مستند' end), v_link);
  end if;

  return v_id;
end;
$$;

create or replace function public.conversation_title(p_conv uuid, p_role text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when c.kind = 'support' and p_role = 'member' then 'إدارة سوداقري'
           when c.kind = 'support' then 'رسالة من ' || coalesce(nullif(pm.full_name, ''), 'عضو')
           when c.kind = 'market' and c.member_id = auth.uid() then
             (case mo.kind when 'sell' then 'عرض بيع ' else 'طلب شراء ' end) || mo.crop || ' في ' || mo.state
           when c.kind = 'market' and mo.created_by = auth.uid() then
             'سؤال ' || coalesce(nullif(pm.full_name, ''), 'تاجر') || ' عن عرضك: ' || mo.crop
           when c.kind = 'market' then
             'السوق: ' || mo.crop || ' — ' || coalesce(nullif(pm.full_name, ''), 'عضو')
           -- The land's name is the investor's once the owner accepts (or a contract stands), not before and not
           -- after a refusal or a withdrawal.
           when p_role = 'investor'
                and not (i.status = 'accepted'
                         or exists (select 1 from partnership_agreements a where a.interest_id = i.id))
             then 'طلب شراكة على أرضٍ في ' || coalesce(l.state, 'السودان')
           when p_role = 'investor' then 'شراكة في «' || coalesce(l.name, 'الأرض') || '»'
           when p_role = 'owner' then 'طلب ' || coalesce(nullif(pi.full_name, ''), 'مستثمر') || ' على «' || coalesce(l.name, 'أرضك') || '»'
           else 'شراكة في «' || coalesce(l.name, 'أرض') || '»'
         end
    from conversations c
    left join profiles pm on pm.id = c.member_id
    left join market_offers mo on mo.id = c.market_offer_id
    left join investor_interests i on i.id = c.interest_id
    left join lands l on l.id = i.land_id
    left join profiles pi on pi.id = i.investor_id
   where c.id = p_conv;
$$;
