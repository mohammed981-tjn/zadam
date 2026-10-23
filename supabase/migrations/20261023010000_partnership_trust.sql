-- ما ينقص الشراكة (البند ١٣٦): تنبيه المخاطرة، وتعريف المستثمر، والمساقاة.
--
-- The owner asked how a partnership between an investor and a landowner should
-- work, and to search for the best ways (docs/studies/partnership-models-ar.md).
-- Most of it was already here: the written agreement, the share as a
-- proportion, the loss rule, the season and its ledger open to the investor,
-- no money through the platform. He chose, on 23 October, to build what was
-- missing. Three of the four are here; the three-party model has its own
-- migration.
--
-- ① The risk warning. The agricultural crowdfunding platforms that collapsed
--   in Nigeria (HO Corn's 50% in six weeks, Farmzhi's 10% a month) never told
--   an investor he could lose his money; Nigeria's SEC drafted a rule to make
--   them. Here the request for a partnership cannot be sent without
--   acknowledging it, and the acknowledgement is kept with the request.
--
--   investor_express_interest gains a fourth argument. The three-argument
--   version is left as it is for the minutes between this migration and the
--   code that calls the new one; it is closed in a later migration once the
--   site no longer calls it.
--
-- ② Who the investor is. The owner read a name and a message. Now also the
--   country his number is from, when he joined, and his record on the
--   platform: requests sent, accepted, agreements signed. For the owner of the
--   land asked about, only — the same scope as land_investor_requests.
--
-- ③ Musaqah. Muzara'a is for a sown crop; trees and palms already standing —
--   the dates of the Northern State and the River Nile, mango — are let under
--   musaqah (Civil Transactions Act 1984, arts. 337–347): the partner tends
--   them for an agreed share of the fruit. A fourth model, with two items an
--   orchard needs and a field does not.
--
-- The three model CHECKs are replaced under the same names with a wider list:
-- Postgres cannot widen a CHECK in place. Nothing a row holds today is refused
-- by the new ones.

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ المساقاة
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.lands
  drop constraint if exists lands_investor_models_check,
  add constraint lands_investor_models_check
    check (investor_models <@ array['sharecrop','lease','finance','musaqah']);

alter table public.investor_interests
  drop constraint if exists investor_interests_model_check,
  add constraint investor_interests_model_check
    check (model in ('sharecrop','lease','finance','musaqah'));

alter table public.partnership_agreements
  drop constraint if exists partnership_agreements_model_check,
  add constraint partnership_agreements_model_check
    check (model in ('sharecrop','lease','finance','musaqah'));

-- As in 20261021230000_partnership_agreements.sql, with the orchard's two
-- items ('trees', 'pruning') and musaqah's shares of the fruit.
create or replace function public.partnership_terms_check(p_model text, p_terms jsonb, p_land_feddans numeric)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  items constant text[] := array['land','water','labour','ploughing','seed','fertiliser','pesticide',
                                 'fuel','irrigation','harvest','transport','storage',
                                 'trees','pruning'];
  v_owner text[];
  v_investor text[];
  v_start date;
  v_end date;
  v_feddans numeric;
  v_os numeric;
  v_is numeric;
begin
  if jsonb_typeof(p_terms) <> 'object' then raise exception 'بنود العقد غير صالحة.'; end if;

  if length(btrim(coalesce(p_terms->>'crop', ''))) not between 2 and 80 then
    raise exception 'اكتب المحصول أو النشاط.';
  end if;
  if length(btrim(coalesce(p_terms->>'season', ''))) not between 2 and 80 then
    raise exception 'اكتب الموسم (مثل: الموسم الشتوي ٢٠٢٦/٢٧).';
  end if;

  begin
    v_start := (p_terms->>'start_date')::date;
    v_end := (p_terms->>'end_date')::date;
  exception when others then
    raise exception 'تاريخا البداية والنهاية غير صالحين.';
  end;
  if v_start is null or v_end is null or v_end <= v_start or v_end > v_start + 1096 then
    raise exception 'النهاية بعد البداية، والمدّة ثلاث سنوات على الأكثر.';
  end if;

  v_feddans := (p_terms->>'feddans')::numeric;
  if v_feddans is null or v_feddans <= 0 or v_feddans > p_land_feddans then
    raise exception 'المساحة أكبر من صفر ولا تتجاوز مساحة الأرض.';
  end if;

  select coalesce(array_agg(x), '{}') into v_owner from jsonb_array_elements_text(coalesce(p_terms->'owner_provides', '[]')) x;
  select coalesce(array_agg(x), '{}') into v_investor from jsonb_array_elements_text(coalesce(p_terms->'investor_provides', '[]')) x;
  if not (v_owner <@ items and v_investor <@ items) then raise exception 'بندٌ غير معروف فيما يقدّمه الطرفان.'; end if;
  if v_owner && v_investor then raise exception 'البند الواحد يقدّمه طرفٌ واحد — راجع ما يقدّمه كلٌّ منكما.'; end if;
  if cardinality(v_owner) + cardinality(v_investor) = 0 then raise exception 'اختر ما يقدّمه كلّ طرف.'; end if;

  if p_model in ('sharecrop','finance','musaqah') then
    v_os := (p_terms->>'owner_share')::numeric;
    v_is := (p_terms->>'investor_share')::numeric;
    if v_os is null or v_is is null or v_os < 1 or v_is < 1 or v_os + v_is <> 100 then
      raise exception 'حصّتا المحصول نسبتان تجمعان ١٠٠٪، ولكلّ طرفٍ ١٪ على الأقلّ.';
    end if;
  end if;

  -- The trees are the owner's in a musaqah: that is what is being let.
  if p_model = 'musaqah' and not ('trees' = any (v_owner)) then
    raise exception 'في المساقاة الشجرُ القائم من صاحب الأرض — اختره فيما يقدّمه.';
  end if;

  if p_model = 'lease' then
    if (p_terms->>'rent_amount')::numeric is null or (p_terms->>'rent_amount')::numeric <= 0 then
      raise exception 'اكتب مبلغ الأجرة.';
    end if;
    if coalesce(p_terms->>'rent_schedule', '') not in ('upfront','two_parts','after_harvest') then
      raise exception 'اختر موعد دفع الأجرة.';
    end if;
  end if;

  if p_model = 'finance' then
    if (p_terms->>'finance_amount')::numeric is null or (p_terms->>'finance_amount')::numeric <= 0 then
      raise exception 'اكتب مبلغ التمويل.';
    end if;
  end if;

  if p_model in ('lease','finance') and coalesce(p_terms->>'currency', '') not in ('SDG','USD') then
    raise exception 'اختر العملة.';
  end if;

  if coalesce(p_terms->>'loss_rule', '') not in ('by_contribution','investor_inputs','custom') then
    raise exception 'اختر حكم الخسارة.';
  end if;
  if p_terms->>'loss_rule' = 'custom' and length(btrim(coalesce(p_terms->>'loss_text', ''))) < 10 then
    raise exception 'اكتب حكم الخسارة الذي اتّفقتما عليه.';
  end if;

  if length(coalesce(p_terms->>'extra', '')) > 2000 or length(coalesce(p_terms->>'loss_text', '')) > 1000 then
    raise exception 'النصّ أطول من المسموح.';
  end if;
end;
$$;

revoke execute on function public.partnership_terms_check(text, jsonb, numeric) from public, anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- ① تنبيه المخاطرة
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.investor_interests add column if not exists risk_ack_at timestamptz;

comment on column public.investor_interests.risk_ack_at is
  'When the investor acknowledged, on sending the request, that farming can lose money and Sudagri guarantees no return (backlog 136).';

create or replace function public.investor_express_interest(p_land uuid, p_model text, p_message text, p_risk_ack boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_land lands;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  if not coalesce(p_risk_ack, false) then
    raise exception 'اقرأ تنبيه المخاطرة وأقرّ به قبل أن ترسل الطلب.';
  end if;
  select * into v_land from lands
   where id = p_land and verification = 'verified' and open_to_investors;
  if v_land.id is null then raise exception 'هذه الأرض ليست معروضةً للمستثمرين.'; end if;
  if v_land.owner_id = auth.uid() then raise exception 'هذه أرضك.'; end if;
  if not (p_model = any (v_land.investor_models)) then
    raise exception 'صاحبُ الأرض لا يقبل هذا النموذج من الشراكة.';
  end if;

  begin
    insert into investor_interests (investor_id, land_id, model, message, risk_ack_at)
    values (auth.uid(), p_land, p_model, btrim(p_message), now())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'أرسلت طلباً على هذه الأرض من قبل.';
  end;

  perform notify_user(v_land.owner_id, 'investor_interest',
    'مستثمرٌ يطلب الشراكة في أرضك',
    format('طلبُ شراكةٍ على الأرض "%s". اقرأه واقبل أو اعتذر — لا يرى المستثمر اسمك ولا هاتفك قبل قبولك.',
           coalesce(v_land.name, 'أرضك')),
    '/lands');
  perform notify_admins('investor_interest',
    'طلبُ شراكةٍ جديد من مستثمر',
    format('على أرضٍ في %s. للاطّلاع في قائمة المراجعة.', coalesce(v_land.state, 'ولاية غير محدّدة')),
    '/admin/inbox');
  return v_id;
end;
$$;

revoke execute on function public.investor_express_interest(uuid, text, text, boolean) from public, anon;
grant execute on function public.investor_express_interest(uuid, text, text, boolean) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ② تعريف المستثمر لصاحب الأرض
-- ═══════════════════════════════════════════════════════════════════════════

-- One row per pending or accepted request on the caller's own land — the rows
-- land_investor_requests() returns — with what the owner should know of the
-- person asking. The country is the dial code of the number the account was
-- made with (profiles.phone holds digits only); an account made by email has
-- none, and says so by returning null. No number is returned before the
-- owner accepts, as before.
create or replace function public.land_investor_profiles()
returns table (
  interest_id uuid, dial_code text, member_since timestamptz,
  requests_sent integer, requests_accepted integer, agreements_signed integer,
  risk_acknowledged boolean)
language sql
stable
security definer
set search_path = public
as $$
  select i.id,
         -- The website's codes (src/lib/phone.ts), longest first where one
         -- could begin another, and in that order.
         (select u.d from unnest(array['249','966','971','974','965','20','90','44','1']) with ordinality as u(d, n)
           where regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') like u.d || '%'
           order by u.n
           limit 1),
         p.created_at,
         (select count(*)::int from investor_interests x where x.investor_id = i.investor_id),
         (select count(*)::int from investor_interests x where x.investor_id = i.investor_id and x.status = 'accepted'),
         (select count(*)::int from partnership_agreements a where a.investor_id = i.investor_id and a.status = 'signed'),
         i.risk_ack_at is not null
    from investor_interests i
    join lands l on l.id = i.land_id
    left join profiles p on p.id = i.investor_id
   where l.owner_id = auth.uid()
     and i.status in ('pending','accepted')
   order by i.created_at desc
   limit 200;
$$;

revoke execute on function public.land_investor_profiles() from public, anon;
grant execute on function public.land_investor_profiles() to authenticated;
