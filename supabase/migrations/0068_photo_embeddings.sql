-- ════════════════════════════════════════════════════════════════
-- 0068 · 사진 임베딩 — 시각 유사도 추천의 저장 기반.
--
-- "이런 사진은 어때요?" 추천을 mood_tags 겹침 점수에서 이미지 임베딩
-- 근접검색으로 바꾸기 위한 스키마. 컬럼·인덱스 추가만 하며 기존 컬럼·
-- 데이터·RLS 는 건드리지 않는다.
--
-- 모델: google/siglip2-so400m-patch16-naflex → 임베딩 1152차원
--   naflex 는 원본 비율을 보존한다. 공개 사진의 80.6% 가 세로(3:4·2:3)이고
--   18.4% 가 가로라 고정 정사각(384) 입력은 어느 쪽이든 구도가 뭉개진다.
--   halfvec(2byte/차원) → 1,572장 기준 약 3.6MB. 검색 품질 차이는 없다.
--
-- 확장 타입·연산자는 extensions 스키마에 있다(public 은 PostgREST 로
-- 외부 노출되므로 확장을 넣지 않는 Supabase 관례). search_path 에 의존하지
-- 않도록 타입·연산자클래스를 전부 스키마 한정한다.
--
-- 되돌리기:
--   drop index if exists public.idx_photos_embedding_hnsw;
--   drop index if exists public.idx_photos_embedding_pending;
--   alter table public.photos
--     drop column if exists embedding,
--     drop column if exists embedding_model,
--     drop column if exists embedded_at;
-- ════════════════════════════════════════════════════════════════

create extension if not exists vector with schema extensions;

-- embedding_model : 모델·해상도 교체 시 어떤 사진이 구 설정 벡터인지 구분해
--                   전량 재백필 대신 점진 재계산을 할 수 있게 남긴다.
--                   값 형식 '<모델명>@<max_num_patches>' 를 지킬 것.
--                     예) siglip2-so400m-patch16-naflex@256
--                   모델명만 넣으면 해상도가 기록되지 않아 컬럼의 목적이 반쪽이 된다.
-- embedded_at     : null 이면 배치 대상. tag_generated_at(0047) 과 같은 방식.
alter table public.photos
  add column if not exists embedding       extensions.halfvec(1152),
  add column if not exists embedding_model text,
  add column if not exists embedded_at     timestamptz;

-- 근접검색은 published 만 대상이라 부분 인덱스로 크기·빌드시간을 줄인다.
-- photographers.status='approved' 는 다른 테이블이라 인덱스에 못 넣는다 →
-- HNSW 로 넉넉히 뽑고 바깥 조인에서 거른다(0069 RPC).
create index if not exists idx_photos_embedding_hnsw
  on public.photos
  using hnsw (embedding extensions.halfvec_cosine_ops)
  where visibility = 'published';

-- 임베딩 배치 대상 큐 — 0047 의 idx_photos_tag_generation_pending 과 동일 패턴.
create index if not exists idx_photos_embedding_pending
  on public.photos (created_at)
  where visibility = 'published' and embedded_at is null;
