-- 분류 제안은 원본 후보 ID/축/채택 상태와 분리해 보관한다.
create table public.mood_candidate_classifications (
  candidate_id text primary key references public.mood_candidates(id) on delete cascade,
  kind text not null check(kind in ('mood','general','pending')),
  axis text check(axis in ('감정','관계','스타일','온도','계절','빛','색감','질감','에너지','공간')),
  version text not null, rule text not null, evidence jsonb not null,
  classified_at timestamptz not null default now(),
  check ((kind='mood' and axis is not null) or (kind<>'mood' and axis is null))
);
alter table public.mood_candidate_classifications enable row level security;
revoke all on public.mood_candidate_classifications from public, anon, authenticated;
grant select,insert,update,delete on public.mood_candidate_classifications to service_role;
create view public.mood_catalog with (security_invoker=true) as
select c.*,
  case when c.axis<>'unassigned' then c.axis
       when x.kind='mood' then x.axis
       when x.kind='general' then 'general' else 'unassigned' end as browsing_axis,
  case when c.axis<>'unassigned' then 'editorial' else coalesce(x.kind,'pending') end as classification_kind,
  x.rule as classification_rule
from public.mood_candidates c left join public.mood_candidate_classifications x on x.candidate_id=c.id;
revoke all on public.mood_catalog from public,anon,authenticated;
grant select on public.mood_catalog to service_role;
