-- 0136. 운영자 행동 기록 (2026-09-19)
--
-- 누가 환불을 승인했는지, 작가를 퇴출했는지, 수수료율을 바꿨는지 추적할 수 없었다.
-- 운영자가 한 명인 지금은 문제가 아니지만
--   · 환불·정산은 **돈이 움직이는 일**이고
--   · 작가 퇴출은 사진·대화·후기가 함께 사라지는 일이며
--   · 수수료율 변경은 작가와의 계약 조건이다
-- 사람이 늘기 전에 있어야 한다.
--
-- ⚠️ **삭제는 이미 남고 있다.** `deleted_records`(0039)가 지운 행 전체를 `deleted_by`
--    와 함께 보관한다. 이 표가 채우는 건 **삭제가 아닌 상태 변경**이다. 둘을 합치지
--    않는 이유는 목적이 달라서다 — 저쪽은 **되돌리려고** 원본을 통째로 들고 있고,
--    이쪽은 **누가 무엇을 했나**만 얇게 남긴다.

create table if not exists public.admin_actions (
  id           uuid primary key default gen_random_uuid(),
  -- 누가. 계정이 지워져도 기록은 남아야 하므로 set null (사람은 몰라도 "무슨 일이
  -- 있었나" 는 남는다). actor_label 에 그때의 이름을 박아 둔다.
  actor_id     uuid references public.profiles(id) on delete set null,
  actor_label  text,
  -- 무엇을 — 'refund' · 'settle' · 'fee_change' 처럼 액션 이름 (lib/admin-audit.ts)
  action       text not null,
  -- 어디에 — 'bookings' / 그 행의 id
  target_table text,
  target_id    text,
  -- 바뀐 값·금액·사유 등. 스키마를 고정하지 않는다 — 액션마다 남길 게 다르다.
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_admin_actions_time
  on public.admin_actions (created_at desc);
create index if not exists idx_admin_actions_target
  on public.admin_actions (target_table, target_id, created_at desc);

comment on table public.admin_actions is
  '운영자가 한 상태 변경 기록. 삭제는 deleted_records(0039)가 따로 남긴다';

alter table public.admin_actions enable row level security;

-- 운영자만 읽는다. **쓰기 정책은 두지 않는다** — 기록은 service_role(서버 액션)만
-- 남기고, 사람이 콘솔에서 지우거나 고칠 수 있으면 기록의 뜻이 없다.
drop policy if exists admin_actions_select on public.admin_actions;
create policy admin_actions_select on public.admin_actions
  for select using (public.is_admin());
