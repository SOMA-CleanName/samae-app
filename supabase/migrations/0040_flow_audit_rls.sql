-- 0040 · 전수 플로우 감사 — RLS/스키마 보강 (청크3)
-- 대상 이슈: C2(inquiries 보호), C4(reviews 위조 차단), M1(favorites 고아 정리), H3(이중부킹 제약)
-- 적용 방식: 운영(prod)은 Supabase SQL Editor 에 붙여넣어 실행. 적용 전 staging/로컬 검증 권장.

-- ─────────────────────────────────────────────
-- C2 · inquiries 접근 명시적 차단 (연락처 PII 보호)
-- ─────────────────────────────────────────────
-- inquiries 는 RLS enable 상태에서 정책이 0개 → 이미 anon/authenticated 전면 차단(암묵적 deny),
-- 모든 접근은 service_role(createAdminClient) 경유다. 연락처(phone/instagram/discord/email/extra)는
-- lib/inquiries 가 status='confirmed' 이전엔 마스킹해 공개한다.
--
-- ⚠️ 작가/운영자용 SELECT 정책을 추가하지 않는다 — RLS 는 행 단위라 인증 클라이언트에 행을 열면
--    연락처 컬럼까지 그대로 노출된다(컬럼 게이팅 불가). 대신 의도를 명시적 deny 로 고정해
--    향후 누군가 무심코 permissive 정책을 추가해 과다 노출하는 것을 RESTRICTIVE 로 막는다.
--    (컬럼 분리/뷰 게이팅은 청크4 설계 항목)
drop policy if exists inquiries_no_client_access on public.inquiries;
create policy inquiries_no_client_access on public.inquiries
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.inquiries is
  '연락처 PII 포함. 클라이언트 직접 접근 금지(RLS deny). 읽기/쓰기는 service_role 전용이며 '
  '연락처는 status=confirmed(운영자 입금확인) 이후에만 lib/inquiries 경유로 공개된다.';

-- ─────────────────────────────────────────────
-- C4 · reviews 작성 강제 (거래 없는 후기/별점 위조 차단)
-- ─────────────────────────────────────────────
-- 기존: with check (user_id = auth.uid()) 뿐 → 완료 거래 없이도 후기 작성 가능(평점 테러).
-- 강화: 본인 소유 + completed 상태 + 해당 작가의 예약일 때만 작성 허용.
--       (booking_id 는 reviews 에서 unique → 1예약 1후기. photographer_id 를 booking 에 묶어
--        타작가에게 위조 후기 다는 것도 차단)
drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = reviews.booking_id
        and b.user_id = auth.uid()
        and b.photographer_id = reviews.photographer_id
        and b.status = 'completed'
    )
  );

-- ─────────────────────────────────────────────
-- M1 · favorites 고아 정리 (폴리모픽 target_id 에 FK 부재 보강)
-- ─────────────────────────────────────────────
-- favorites.target_id 는 photographer/photo 를 polymorphic 참조(FK 없음) → 대상 삭제 시 고아 누적,
-- 삭제된 대상의 찜수가 부풀려진다. 대상 삭제 시 매칭 favorites 를 정리하는 트리거를 둔다.
create or replace function public.cleanup_favorites_on_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- tg_argv[0] = 정리할 target_type ('photographer' | 'photo')
  delete from public.favorites
  where target_type = tg_argv[0]
    and target_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_photographers_cleanup_favorites on public.photographers;
create trigger trg_photographers_cleanup_favorites
  after delete on public.photographers
  for each row execute function public.cleanup_favorites_on_delete('photographer');

drop trigger if exists trg_photos_cleanup_favorites on public.photos;
create trigger trg_photos_cleanup_favorites
  after delete on public.photos
  for each row execute function public.cleanup_favorites_on_delete('photo');

-- ─────────────────────────────────────────────
-- H3 · bookings 시간겹침 EXCLUSION 제약 (이중부킹 원자적 차단)
-- ─────────────────────────────────────────────
-- 앱(acceptBooking)의 충돌 스캔만으로는 동시 수락 race 를 완전히 막지 못한다.
-- 같은 작가의 '확정' 예약끼리 촬영 시간이 겹치면 DB 가 거부하도록 제약을 건다.
--   · 활성 상태(accepted~completed) + shoot_at 있는 행만 대상(partial)
--   · 시간범위 = [shoot_at, shoot_at + duration_min) (duration null 이면 60분)
-- ⚠️ 적용 전 기존 데이터에 겹치는 활성 예약이 있으면 ALTER 가 실패한다 → 먼저 정리 필요.
create extension if not exists btree_gist;

-- 예약 시간범위 [shoot_at, shoot_at + duration) 계산용.
-- timestamptz + interval 연산자는 STABLE 로 분류된다(interval 의 월/일 성분이 TZ 의존이라).
-- 하지만 우리는 '분' 간격만 더하므로 결과가 결정적이다 → IMMUTABLE 래퍼로 감싸 인덱스/제약 식에 사용 가능하게 한다.
create or replace function public.booking_time_range(shoot_at timestamptz, duration_min int)
returns tstzrange language sql immutable as $$
  select tstzrange(shoot_at, shoot_at + make_interval(mins => coalesce(duration_min, 60)));
$$;

alter table public.bookings drop constraint if exists bookings_no_time_overlap;
alter table public.bookings
  add constraint bookings_no_time_overlap
  exclude using gist (
    photographer_id with =,
    public.booking_time_range(shoot_at, duration_min) with &&
  )
  where (status in ('accepted', 'paid', 'shot', 'delivered', 'completed') and shoot_at is not null);
