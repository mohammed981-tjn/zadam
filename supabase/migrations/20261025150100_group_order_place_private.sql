-- موقع الاستلام واسم المنظّم في الطلب الجماعي لأهل الطلب وللمدير وحدهم (البند ١٩٨، بقرار المالك 25 أكتوبر 2026).
--
-- المالك: موقع الاستلام «لا يراه إلا الجماعة الذين طلبوا فقط والإدارة». اسم المكان وإحداثيّاته واسم المنظّم لأهل
-- الطلب وللمدير؛ والمحليّة والولاية للجميع ليعرف المزارع هل الطلب قريبٌ منه.
--
-- جزءٌ من الموجة الأولى لمراجعة البند ١٩٨ (docs/review-198-ar.md).

-- ── ٢. الطلب الجماعي ────────────────────────────────────────────────────────

create or replace function public.group_order_directory()
returns table (id uuid, title text, supplier_id uuid, supplier_name text, pickup_name text, pickup_locality text,
               pickup_state text, drop_day date, deadline date, target_tonnes numeric, pledged_tonnes numeric,
               members bigint, deposit_pct numeric, status text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.title, o.supplier_id, s.name,
         case when group_order_role(o.id) is not null or is_admin() then o.pickup_name end,
         o.pickup_locality, o.pickup_state,
         o.drop_day, o.deadline, o.target_tonnes,
         coalesce((select round(sum(p.quantity * l.unit_kg) / 1000, 2)
                     from group_order_pledges p join group_order_lines l on l.id = p.line_id
                    where p.order_id = o.id and p.status in ('pledged','deposit_received','collected')), 0),
         (select count(distinct p.user_id) from group_order_pledges p
           where p.order_id = o.id and p.status in ('pledged','deposit_received','collected')),
         o.deposit_pct, o.status
    from group_orders o join suppliers s on s.id = o.supplier_id
   where o.status <> 'cancelled' or o.organiser_id = auth.uid()
   order by (o.status = 'open') desc, o.drop_day asc
   limit 200;
$$;

create or replace function public.group_order_detail(p_order uuid)
returns table (id uuid, title text, supplier_id uuid, supplier_name text, supplier_phone text,
               organiser_name text, organiser_phone text,
               pickup_name text, pickup_locality text, pickup_state text,
               pickup_lat numeric, pickup_lng numeric,
               drop_day date, deadline date, target_tonnes numeric, pledged_tonnes numeric,
               members bigint, deposit_pct numeric, payee text, payee_account text,
               notes text, status text, my_role text)
language sql
stable
security definer
set search_path = public
as $$
  with r as (select group_order_role(p_order) as role, is_admin() as admin)
  select o.id, o.title, o.supplier_id, s.name, s.phone,
         case when r.role is not null or r.admin then o.organiser_name end,
         case when r.role is not null or r.admin then o.organiser_phone end,
         case when r.role is not null or r.admin then o.pickup_name end,
         o.pickup_locality, o.pickup_state,
         case when r.role is not null or r.admin then o.pickup_lat end,
         case when r.role is not null or r.admin then o.pickup_lng end,
         o.drop_day, o.deadline, o.target_tonnes,
         coalesce((select round(sum(p.quantity * l.unit_kg) / 1000, 2)
                     from group_order_pledges p join group_order_lines l on l.id = p.line_id
                    where p.order_id = o.id and p.status in ('pledged','deposit_received','collected')), 0),
         (select count(distinct p.user_id) from group_order_pledges p
           where p.order_id = o.id and p.status in ('pledged','deposit_received','collected')),
         o.deposit_pct, o.payee,
         case when r.role is not null or r.admin then o.payee_account end,
         o.notes, o.status, r.role
    from group_orders o join suppliers s on s.id = o.supplier_id, r
   where o.id = p_order
     and (o.status <> 'cancelled' or r.role is not null or r.admin);
$$;
