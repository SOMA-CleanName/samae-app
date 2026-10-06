-- ════════════════════════════════════════════════════════════════
-- 0145 · 촬영 장소 ↔ 사진 연결 (2026-10-06)
--
--   장소(spots)와 사진은 FK 없이 **글자로만** 이어져 있었다 — 사진의 `location_text` 에 장소
--   키워드가 들어 있으면 그 장소 사진이다(lib/spots). 그래서
--     · "을지로에 어떤 사진이 걸렸나" 를 SQL·어드민에서 볼 수 없었고
--     · 화면마다 따로 계산해 같은 날에도 장수가 어긋날 수 있었고(카드는 06:00 목록, 상세는 DB)
--     · 자동 매칭이 틀려도(커버 지역을 나열한 사진, 메모 없이 그 장소에서 찍은 사진) 고칠 데가 없었다.
--
--   이 표에 연결을 저장한다.
--     · source = 'auto'   — 키워드 매칭으로 채운다(사진 공개 여부와 상관없이). 매일 06:00 맥미니 배치가 신규 사진만 더하고(docs/28),
--                           전체는 어드민 「전체 다시 계산」 버튼으로. 규칙은 lib/spots 그대로.
--     · source = 'manual' — 운영자가 어드민(장소별 사진)에서 직접 넣은 것. 자동 계산이 건드리지 않는다.
--     · excluded = true   — 운영자가 뺀 자동 매칭. 다음 자동 계산이 되살리지 않는다.
--
--   사진이 가진 장소 값은 그대로 저장한다 — 「경복궁, 창덕궁, 창경궁, 덕수궁」 처럼 여러 곳을 나열한 사진은
--   네 장소 모두에 auto 로 연결된다(2026-10-06 결정). 다만 그런 사진은 지면에 자동으로 띄우지 않는다
--   (같은 사진이 네 갤러리에 똑같이 뜨던 문제, 2026-08-31). 띄울 곳은 운영자가 싣는다(→ manual).
--   「서울」 처럼 장소보다 넓은 말은 여기가 아니라 photos.region 에 남긴다(lib/photo-region, 같은 계산 때).
--
--   **사진의 공개 여부는 저장하지 않는다.** 읽을 때 photos 와 붙여 그 자리에서 본다 — 숨긴 사진은
--   다음 계산을 기다리지 않고 바로 빠진다. 사진이 지워지면 연결도 같이 지워진다(cascade).
--
--   되돌리기: drop table public.spot_photos;
--             (앱은 표가 없거나 비어 있으면 예전처럼 키워드로 직접 매칭한다)
-- ════════════════════════════════════════════════════════════════

create table if not exists public.spot_photos (
  spot_id     uuid not null references public.spots(id) on delete cascade,
  photo_id    uuid not null references public.photos(id) on delete cascade,
  source      text not null default 'auto' check (source in ('auto', 'manual')),
  excluded    boolean not null default false,
  -- 지면에 거는 순서(자동: 단독 표기 우선 → 앨범 돌려 뽑기). 수동은 자동보다 앞에 선다.
  sort        integer not null default 0,
  -- 운영자가 손댄 행만 채운다(자동 계산은 null)
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (spot_id, photo_id)
);

-- 사진 쪽에서 "이 사진은 어느 장소에 붙었나" 를 찾는다(어드민 · 사진 삭제 cascade)
create index if not exists idx_spot_photos_photo on public.spot_photos (photo_id);

alter table public.spot_photos enable row level security;

-- 공개 지면(/spots 는 anon 클라이언트로 빌드)이 읽는다. 사진 공개 여부는 photos RLS 가 거른다.
-- 운영자가 뺀 행은 공개 쪽에 보이지 않는다.
drop policy if exists spot_photos_select on public.spot_photos;
create policy spot_photos_select on public.spot_photos for select using (
  not excluded or public.is_admin()
);

drop policy if exists spot_photos_write on public.spot_photos;
create policy spot_photos_write on public.spot_photos for all
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.spot_photos is
  '촬영 장소 ↔ 사진 연결 — auto 는 키워드 매칭(매일 06:00 신규 · 어드민 버튼 전체)으로, manual 은 운영자가. excluded 는 운영자가 뺀 자동 매칭.';
