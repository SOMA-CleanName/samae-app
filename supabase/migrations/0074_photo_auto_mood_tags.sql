-- ════════════════════════════════════════════════════════════════
-- 0074 · 자동 무드 태그 — SigLIP 텍스트 타워로 붙이는 무드 어휘. (docs/22 §7.5 · 8단계)
--
-- generated_tags 와 **별도 공간**을 쓴다. 그쪽은 2026-06-22 에 게시물 단위로
-- 일괄 입력된 검색 키워드(지역·촬영종류 위주)이며 출처가 다르다. 섞으면 어느 값이
-- 사람이 넣은 것이고 어느 값이 기계가 붙인 것인지 구분할 수 없게 된다.
--
-- 담는 것은 **무드(톤·빛·분위기·질감·공간감)뿐**이다. 촬영 종류(웨딩·커플·가족)는
-- 넣지 않는다 — 타겟 축(target_explore_categories)이 담당하고, PR #267 에서
-- 확인했듯 태그로 판단하면 범용 태그 하나에 걸려 피드가 오염된다.
--
-- 점수 컬럼을 두지 않는 이유: photos.embedding(0068)이 이미 저장돼 있어 어휘가
-- 바뀌어도 사진 재다운로드 없이 태그를 다시 계산할 수 있다. 임베딩이 durable
-- 산출물이고 태그는 파생물이다.
--
-- 되돌리기:
--   drop index if exists public.idx_photos_auto_mood_tags;
--   drop index if exists public.idx_photos_auto_mood_pending;
--   alter table public.photos
--     drop column if exists auto_mood_tags,
--     drop column if exists auto_mood_model,
--     drop column if exists auto_mood_at;
-- ════════════════════════════════════════════════════════════════

alter table public.photos
  -- 무드 라벨(한글). 프롬프트는 영어지만 저장·노출은 한글이다.
  add column if not exists auto_mood_tags  text[] not null default '{}',
  -- '<모델명>@<어휘버전>' 형식. 0068 의 embedding_model 과 같은 규칙(docs/22 §6).
  -- 어휘가 바뀌면 VERSION 이 올라가고, 그 값으로 재생성 대상을 고른다.
  add column if not exists auto_mood_model text,
  -- null = 배치 대상. 0047 tag_generated_at · 0068 embedded_at 과 같은 큐 패턴.
  add column if not exists auto_mood_at    timestamptz;

-- 태그 겹침 조회용. mood_tags 의 idx 와 같은 형태.
create index if not exists idx_photos_auto_mood_tags
  on public.photos using gin (auto_mood_tags);

-- 배치 대상 큐.
create index if not exists idx_photos_auto_mood_pending
  on public.photos (created_at)
  where visibility = 'published' and auto_mood_at is null;
