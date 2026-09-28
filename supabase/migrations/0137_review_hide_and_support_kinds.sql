-- 0137. 후기 숨김 + 접수 종류 확장 (2026-09-19)
--
-- docs/45 의 2·3·4번을 한 판에 담는다. 셋 다 "운영이 손댈 수 없던 것" 이다.

-- ─────────────────────────────────────────────────────────────
-- 1) 후기 숨김
--
-- 부적절한 후기가 올라와도 내리거나 가릴 방법이 없어 DB 를 직접 열어야 했다.
-- 지우지 않고 **가린다** — 지우면 왜 사라졌는지 답할 수 없고, 분쟁이 나면 원문이 필요하다.
-- ─────────────────────────────────────────────────────────────

alter table public.reviews
  add column if not exists hidden_at     timestamptz,
  add column if not exists hidden_by     uuid references public.profiles(id) on delete set null,
  add column if not exists hidden_reason text;

comment on column public.reviews.hidden_at is
  '가린 시각. null 이면 공개. 지우지 않고 가리는 이유는 분쟁 시 원문이 필요해서다';

-- ⚠️ **평점 집계에서 빼야 한다.** 이게 없으면 1점짜리 악성 후기를 가려도 rating_avg 는
--    그대로 끌려 있어서, 가린 의미가 없다. 트리거는 이미 insert/update/delete 에 걸려
--    있으므로(0001) 숨김(=update)도 재계산을 부른다.
create or replace function public.refresh_photographer_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pid uuid := coalesce(new.photographer_id, old.photographer_id);
begin
  update public.photographers p
  set review_count = sub.cnt,
      rating_avg    = coalesce(sub.avg_rating, 0)
  from (
    select count(*)::int as cnt, round(avg(rating)::numeric, 1) as avg_rating
    from public.reviews
    where photographer_id = pid
      and hidden_at is null   -- ← 0137
  ) sub
  where p.id = pid;
  return null;
end;
$$;

-- 가린 후기는 아무에게도 안 보인다. 다만 **쓴 본인**은 계속 본다 —
-- 자기가 쓴 글이 예약 상세에서 통째로 사라지면 "내 후기가 왜 없지" 가 된다.
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select using (hidden_at is null or user_id = auth.uid() or public.is_admin());

-- 기존 행을 한 번 훑어 집계를 맞춘다 (hidden_at 이 전부 null 이라 값은 안 바뀌지만,
-- 함수가 바뀌었으니 한 번 돌려 두는 편이 안전하다)
update public.photographers p
set review_count = sub.cnt,
    rating_avg   = coalesce(sub.avg_rating, 0)
from (
  select photographer_id, count(*)::int as cnt, round(avg(rating)::numeric, 1) as avg_rating
  from public.reviews where hidden_at is null group by photographer_id
) sub
where p.id = sub.photographer_id;

-- ─────────────────────────────────────────────────────────────
-- 2) 접수 종류에 신고·개인정보 요청 추가
--
--   report  — 사람이 "이 사람 이상해요" 라고 말할 곳이 없었다. 검열(moderation.ts)에
--             걸린 것만 자동 기록됐고, 걸리지 않는 행동은 접수될 데가 없었다.
--   privacy — 개인정보처리방침 6조가 "열람·정정·삭제·처리정지 요청에 지체 없이 조치"
--             를 약속하는데 접수할 창구가 없었다(docs/44).
-- ─────────────────────────────────────────────────────────────

alter table public.support_requests drop constraint if exists support_requests_kind_check;
alter table public.support_requests
  add constraint support_requests_kind_check
  check (kind in ('refund', 'reschedule', 'other', 'photographer_cancel', 'report', 'privacy'));

-- 신고 대상 — 예약·대화가 없는 신고도 있다(프로필만 보고 신고). 그래서 booking_id·
-- conversation_id 와 별개로 "누구를" 을 따로 둔다.
alter table public.support_requests
  add column if not exists target_profile_id uuid references public.profiles(id) on delete set null;

comment on column public.support_requests.target_profile_id is
  '신고(kind=report) 대상. 예약·대화 없이도 신고할 수 있어 booking_id 와 별개로 둔다';

create index if not exists idx_support_requests_kind
  on public.support_requests (kind, status, created_at desc);
