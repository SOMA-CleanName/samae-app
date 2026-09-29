-- ════════════════════════════════════════════════════════════════
-- 0138 · 무드 태그 검색용 사진 목록 (2026-09-21)
--
-- 무드 검색은 태그 직접 일치 + SigLIP 을 섞는다(docs/29 §12.14). 태그 일치를 찾으려면 공개 사진 전부의
-- 태그·앨범 글이 필요한데, 검색마다 1,600장을 앨범·작가와 붙여 읽으면 0.1~1.4초가 걸렸다.
--
-- 맥미니가 매일 06:00 백필을 끝낸 **뒤** 목록을 한 번 만들어 여기 한 줄로 넣는다
-- (scripts/embed/build_search_tags.py). 앱은 이 줄을 하루 한 번(06:00 뒤) 읽어 서버 메모리에 들고 쓴다.
--
-- ⚠️ 목록은 하루 한 번만 바뀐다. 그 사이 비공개로 돌리거나 지운 사진, 피드에서 내린 사진도
--    다음 06:00 까지 무드 태그 검색에 걸릴 수 있다 — 검색할 때 공개 여부를 다시 보지 않기로 했다(2026-09-21 결정).
--
-- 서비스 역할(맥미니·앱 서버)만 읽고 쓴다 — RLS 를 켜고 정책을 두지 않는다.
--
-- 되돌리기: drop table public.search_tag_snapshot;
--           (앱은 줄이 없으면 예전처럼 검색마다 직접 읽는다)
-- ════════════════════════════════════════════════════════════════

create table if not exists public.search_tag_snapshot (
  id          smallint primary key default 1 check (id = 1),   -- 한 줄뿐
  photos      jsonb not null,        -- 사진: id·주소·크기·태그·장소·앨범/작가 id
  albums      jsonb not null,        -- 앨범 id → 제목·설명·장소 (사진마다 되풀이하지 않는다)
  photographers jsonb not null,      -- 작가 id → 이름·지역·태그
  photo_count integer not null,
  built_at    timestamptz not null default now()
);

alter table public.search_tag_snapshot enable row level security;

comment on table public.search_tag_snapshot is
  '무드 태그 검색용 공개 사진 목록 — 맥미니가 매일 06:00 백필 뒤 만든다. 하루 동안 공개 여부가 늦게 반영된다(docs/29 §12.15).';
