-- ════════════════════════════════════════════════════════════════
-- 0098 · 봇 전역 정책 (2026-08-27)
--
--   지금까지 사매 공통 정책·기본 말투·모델은 코드에 하드코딩돼 있어
--   한 줄 바꾸려면 배포가 필요했다. 상담봇은 손님이 작가를 만나기 전
--   가장 먼저 말을 거는 존재라, 잘못 말하고 있을 때 **배포 없이 끌 수 있어야 한다.**
--
--   싱글턴 1행 (platform_account 와 같은 패턴: id boolean primary key check(id)).
--   앱은 조회 실패 시 코드 상수(platform-policy.ts)로 폴백한다 — 봇이 멈추지 않게.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.bot_settings (
  id             boolean primary key default true check (id),
  -- 전역 킬스위치: 끄면 봇은 답하지 않고 "작가님께 전달드릴게요" 로만 받는다
  enabled        boolean not null default true,
  -- 사매 공통 정책 — 모든 작가 봇의 프롬프트에 주입된다. 비우면 코드 상수 사용
  policy_text    text not null default '',
  policy_version integer not null default 1,
  -- 작가가 따로 말투를 정하지 않았을 때의 기본 말투
  default_tone   text not null default '',
  -- 봇 LLM 모델. 비우면 ANTHROPIC_MODEL env → 코드 기본값
  model          text not null default '',
  updated_at     timestamptz not null default now()
);

insert into public.bot_settings (id) values (true) on conflict (id) do nothing;

alter table public.bot_settings enable row level security;

-- 조회·수정 모두 운영자만. 봇 서버는 service_role 이라 정책을 우회한다.
drop policy if exists "bot_settings_admin" on public.bot_settings;
create policy "bot_settings_admin" on public.bot_settings
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update on public.bot_settings to authenticated;
