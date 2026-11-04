-- رابط رفع البحث لطلبٍ واحدٍ مسجَّل، وكنسٌ لما تُرك (فحص 3 نوفمبر 2026، public-api-4 / web-client-3؛ المالك، 4 نوفمبر،
-- السؤال 25).
--
-- كان /api/research يعطي أيّ زائرٍ رابط رفعٍ إلى دلو research، ولا يتذكّر أنّه أعطاه، ولا يمسح ملفّاً لم يُرسَل معه بحث،
-- وإن تعذّر سؤالُ حدّ المحاولات أعطى الرابط على كلّ حال. الآن: كلّ رابطٍ يُسجَّل هنا بمساره، والإرسالُ يقبل مساراً
-- سُجِّل ولم يُستعمل خلال يوم ويعلّمه مستعملاً؛ والفحص اليوميّ يمحو ما في incoming/ ممّا لم يُرسَل معه بحثٌ بعد يوم.
-- للخادم وحده: لا يقرؤه ولا يكتبه أحدٌ غيره.

create table public.research_uploads (
  path       text primary key check (path ~ '^incoming/[0-9a-f-]{36}\.pdf$'),
  issued_at  timestamptz not null default now(),
  used_at    timestamptz
);

comment on table public.research_uploads is 'روابط رفع البحوث التي أعطاها الخادم، ومتى استُعمل كلٌّ منها. للخادم وحده.';

alter table public.research_uploads enable row level security;
revoke all on table public.research_uploads from public, anon, authenticated;
grant select, insert, update, delete on table public.research_uploads to service_role;
