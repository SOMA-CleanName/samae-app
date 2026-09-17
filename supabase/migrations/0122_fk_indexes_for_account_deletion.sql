-- 회원 탈퇴가 **시간 초과로 죽고 있었다.** 그 자리를 막는 인덱스.
--
-- 증상: 설정 → 회원 탈퇴 를 누르면 예약·결제까지는 지워지고 프로필 단계에서 실패했다.
-- 화면에는 "An error occurred in the Server Components render." 만 떴다(2026-09-16 실측).
--
-- 실제 에러는 이거다 —
--
--   ERROR: canceling statement due to statement timeout
--   구문: UPDATE ONLY "public"."bookings" SET "refund_paid_by" = NULL
--          WHERE $1 OPERATOR(pg_catalog.=) "refund_paid_by"
--
-- profiles 한 행을 지우면 이를 참조하는 컬럼들이 `on delete set null` 로 따라 갱신되는데,
-- **그 컬럼에 인덱스가 없으면 Postgres 가 해당 테이블을 통째로 훑는다.** 참조하는 테이블이
-- 16개라 전부 풀스캔이고, analytics_events(6.4만행·39MB) 와 deleted_records(2.2만행·29MB)
-- 가 특히 비쌌다. 합이 8초 제한을 넘겼다.
--
-- ⚠️ **FK 를 새로 만들 때 인덱스는 선택이 아니다.** Postgres 는 참조되는 쪽(부모)에만
--    자동으로 인덱스를 만들고, 참조하는 쪽(자식 컬럼)에는 만들어 주지 않는다. 자식 인덱스가
--    없으면 부모 행을 지우거나 갱신할 때마다 자식 테이블 전체를 훑는다. 평소엔 아무 증상이
--    없다가 — 조회는 멀쩡하다 — 삭제할 때만 터지고, 그때는 이미 데이터가 쌓여 있다.
--
-- CONCURRENTLY 를 쓰지 않는다: 마이그레이션이 트랜잭션 안에서 돌아 쓸 수 없고,
-- 가장 큰 테이블도 6.4만 행이라 잠금이 순식간이다.

-- 큰 것부터 — 여기가 시간의 대부분이다
create index if not exists analytics_events_profile_id_idx on public.analytics_events (profile_id);
create index if not exists deleted_records_deleted_by_idx  on public.deleted_records  (deleted_by);

-- 나머지. 지금은 작지만 같은 이유로 언젠가 같은 방식으로 터진다
create index if not exists album_ad_consent_logs_actor_idx        on public.album_ad_consent_logs        (actor);
create index if not exists messages_sender_id_idx                 on public.messages                    (sender_id);
create index if not exists notification_queue_profile_id_idx      on public.notification_queue          (profile_id);
create index if not exists inquiries_deposit_confirmed_by_idx     on public.inquiries                   (deposit_confirmed_by);
create index if not exists conversations_photographer_id_idx      on public.conversations               (photographer_id);
create index if not exists bookings_refund_paid_by_idx            on public.bookings                    (refund_paid_by);
create index if not exists booking_extras_requested_by_idx        on public.booking_extras              (requested_by);
create index if not exists reviews_user_id_idx                    on public.reviews                     (user_id);
create index if not exists photographer_agreements_profile_id_idx on public.photographer_agreements     (profile_id);
create index if not exists moderation_events_sender_id_idx        on public.moderation_events           (sender_id);
create index if not exists support_requests_requester_id_idx      on public.support_requests            (requester_id);
create index if not exists support_requests_photographer_ack_by_idx on public.support_requests          (photographer_ack_by);
create index if not exists casting_round_photographers_photographer_id_idx on public.casting_round_photographers (photographer_id);
create index if not exists casting_applications_decided_by_idx    on public.casting_applications        (decided_by);
