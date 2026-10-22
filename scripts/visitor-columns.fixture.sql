-- أعمدةُ الإنتاج التي تضيفها هجراتٌ لا تحمّلها بوّابةُ ما يقرؤه الزائر (البند ١٣٢).
--
-- verify-visitor-columns.sh loads the migrations that create the eighteen
-- tables, not every migration that later added a column to them. The grants
-- name every production column, so the columns those later migrations add are
-- stood in here, with their production types:
--
--   export_offer_evidence.document_type_id  20260904230000_export_readiness.sql
--   feedback.ai_reply, ai_replied_at,       20260904100000_support_auto_reply.sql
--            ai_reply_engine
--   nafir_calls.canal_id                    20260925140000_canals.sql
--   projects.land_id                        20261022020000_project_on_verified_land.sql
--
-- Listed against production on 22 October 2026 (information_schema.columns).

alter table public.export_offer_evidence add column if not exists document_type_id uuid;
alter table public.feedback add column if not exists ai_reply text;
alter table public.feedback add column if not exists ai_replied_at timestamptz;
alter table public.feedback add column if not exists ai_reply_engine text;
alter table public.nafir_calls add column if not exists canal_id uuid;
alter table public.projects add column if not exists land_id uuid;
