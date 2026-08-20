-- ════════════════════════════════════════════════════════════════
-- 0077 · 톤 디스크립터 저장 — 7단계(색감 가중) 의 저장 기반. (docs/22 §7.6)
--
-- SigLIP 임베딩은 피사체·상황(의미)이 지배적이라 색감·노출 표현이 약하다
-- (docs/22 §4.6). 그 약한 축을 픽셀 통계 22차원으로 따로 뽑아 두고,
-- 0078 RPC 가 근접검색 점수에 α 비율로 섞는다.
--
--   유사도거리 = α × (SigLIP 코사인거리) + (1−α) × scale × (톤 코사인거리)
--
-- 컬럼·테이블 추가만 하며 기존 컬럼·데이터·RLS 는 건드리지 않는다.
--
-- 왜 임베딩에 이어붙이지 않는가
--   1152+22 로 차원을 바꾸면 §9.3 3번(컬럼 타입 변경)에 걸리고, α 를 조정할
--   때마다 1,800장 전량 재백필이 된다. 별도 컬럼이면 α 는 RPC 인자 하나다.
--
-- 왜 halfvec 이 아니라 vector 인가
--   22차원이라 fp16 으로 아껴야 할 용량 자체가 없다(1,807장 × 88B ≈ 159KB).
--   임베딩과 달리 값이 z-score 라 부호·소수점이 촘촘해 float4 가 안전하다.
--
-- 되돌리기:
--   drop index if exists public.idx_photos_tone_pending;
--   drop table if exists public.photo_tone_stats;
--   alter table public.photos
--     drop column if exists tone_vec,
--     drop column if exists tone_stats_version,
--     drop column if exists toned_at;
-- ════════════════════════════════════════════════════════════════

-- tone_vec           : z-score 표준화 후 L2 정규화된 22차원. 코사인을 바로 쓴다.
-- tone_stats_version : 어떤 기준 통계로 표준화했는지. 통계가 바뀌면 좌표계가
--                      어긋나므로(아래 photo_tone_stats 주석) 반드시 함께 남긴다.
-- toned_at           : null 이면 배치 대상. embedded_at 과 같은 방식.
alter table public.photos
  add column if not exists tone_vec           extensions.vector(22),
  add column if not exists tone_stats_version text,
  add column if not exists toned_at           timestamptz;

-- ────────────────────────────────────────────────────────────────
-- 기준 통계 — 이것을 저장하지 않으면 신규 사진이 다른 좌표계에 놓인다.
--
-- 톤 디스크립터는 차원마다 스케일이 다르다(히스토그램 0~1 vs 표준편차 수십).
-- z-score 표준화가 필수인데, 그 평균·표준편차를 카탈로그마다 새로 구하면
-- 백필할 때마다 기준이 미세하게 달라져 **기존 벡터와 비교가 성립하지 않는다.**
-- scripts/embed/tone.py 모듈 상단 '함정' 참조.
--
-- blend_scale : 두 축의 분산 보정 상수. SigLIP 코사인은 좁은 띠에 몰려 있고
--               (표준편차 0.080) 톤 코사인은 넓게 퍼진다(0.348). 보정 없이
--               섞으면 α=0.9 인데 순위 변동의 3분의 1을 톤이 좌우한다 —
--               눈금이 거짓말을 한다. 표준편차 비로 나눠야 α 가 제 뜻을 갖는다.
--               표본 300장 기준 측정값이 0.231 이었다(docs/22 §7.6).
--               실제 값은 tone_backfill.py --fit 이 카탈로그 전체로 재측정해 넣는다.
-- ────────────────────────────────────────────────────────────────
create table if not exists public.photo_tone_stats (
  version     text primary key,
  mean        real[]  not null,
  std         real[]  not null,
  blend_scale real    not null,
  sample_size integer not null,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint photo_tone_stats_dim check (
    array_length(mean, 1) = 22 and array_length(std, 1) = 22
  ),
  constraint photo_tone_stats_scale_positive check (blend_scale > 0)
);

-- 활성 통계는 언제나 한 줄. 두 줄이 되면 RPC 가 어느 좌표계를 쓰는지
-- 알 수 없게 되므로 DB 차원에서 막는다.
create unique index if not exists idx_photo_tone_stats_active
  on public.photo_tone_stats (is_active)
  where is_active;

-- 정책을 하나도 두지 않는다 = anon/authenticated 는 읽지 못한다.
-- 배치는 service_role(RLS 우회), 0078 RPC 는 security definer 로 읽는다.
alter table public.photo_tone_stats enable row level security;

-- 톤 배치 대상 큐 — idx_photos_embedding_pending 과 동일 패턴.
-- 임베딩이 이미 있는 사진만 대상이다. 톤만 있고 임베딩이 없으면 RPC 후보 풀에
-- 애초에 들어가지 못해 계산이 버려진다.
create index if not exists idx_photos_tone_pending
  on public.photos (created_at)
  where visibility = 'published' and embedding is not null and tone_vec is null;
