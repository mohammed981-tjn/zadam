-- الهويّة كما يضعها PostgREST، لبوّابات السلسلة الكاملة: auth.uid() من مطالبات الطلب لا من جدول _who الذي تستعمله
-- base-schema.sql (والعضو لا يقرؤه). تُكتب الهويّة بـ set_config('request.jwt.claims', ...).
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true), auth.jwt() ->> 'sub'), '')::uuid $$;
grant execute on function auth.uid(), auth.jwt(), auth.role() to anon, authenticated, service_role;
