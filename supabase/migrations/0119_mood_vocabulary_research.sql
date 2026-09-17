-- 무드 후보/검증 자료만 저장한다. 기존 photos 태그는 변경하지 않는다.
create table public.mood_sources (
  id text primary key, url text not null, revision text not null,
  license_status text not null, attribution text not null,
  collected_at timestamptz not null default now(), metadata jsonb not null default '{}'
);
create table public.mood_candidates (
  id text primary key, label text not null, axis text not null,
  english_prompt text,
  selection_status text not null default 'collected'
    check(selection_status in ('collected','shortlisted','approved','rejected')),
  selection_basis text not null default 'source_inventory_not_usage_frequency',
  created_at timestamptz not null default now(), unique(label,axis)
);
create table public.mood_candidate_sources (
  source_id text references public.mood_sources on delete cascade,
  entry_key text, candidate_id text not null references public.mood_candidates on delete cascade,
  metadata jsonb not null default '{}', primary key(source_id,entry_key)
);
create index mood_candidate_sources_candidate_idx on public.mood_candidate_sources(candidate_id);
create table public.mood_validation_runs (
  id text primary key, model text not null, candidate_count integer not null,
  photo_count integer not null, metadata jsonb not null,
  created_at timestamptz not null default now()
);
create table public.mood_validation_results (
  run_id text references public.mood_validation_runs on delete cascade,
  candidate_id text references public.mood_candidates on delete cascade,
  photo_id uuid references public.photos on delete cascade,
  rank integer not null check(rank>0), cosine double precision not null check(cosine between -1 and 1),
  review_status text not null default 'pending' check(review_status in ('pending','match','mismatch','uncertain')),
  primary key(run_id,candidate_id,photo_id), unique(run_id,candidate_id,rank)
);
create index mood_validation_results_photo_idx on public.mood_validation_results(photo_id);
do $$ declare t text; begin
  foreach t in array array['mood_sources','mood_candidates','mood_candidate_sources','mood_validation_runs','mood_validation_results'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to service_role',t);
  end loop;
end $$;
