-- ─────────────────────────────────────────────
-- 0147. 광고성 정보 수신 동의 — **받은 적이 없었다.**
--
-- 가입 화면에서 받는 동의는 이용약관·개인정보 처리방침 둘뿐이었다. 그래서 지금까지
-- 가입한 사람 전원이 **광고성 정보를 보낼 수 없는 상태**다.
--
-- 정보통신망법 제50조는 영리목적 광고성 정보를 보내기 전에 수신동의를 받도록 하고,
-- 동의 시점·방법을 증적으로 남기게 한다. 지금 나가는 알림톡 9종은 예약·입금·정산 같은
-- **거래 알림**이라 여기 해당하지 않는다 — 문제가 되는 건 이벤트·할인·재방문 유도다.
--
-- ⚠️ **선택 동의다.** 필수로 묶으면 그 자체가 위법이다(제50조 제4항·약관규제법).
--    가입을 막는 조건으로 쓰지 말 것.
-- ⚠️ 철회도 같은 칸에 기록한다. false 로 바꾸고 _at 을 그때로 갱신한다 —
--    "언제 거부했는가" 도 증적이다. 이력이 필요해지면 행을 쌓는 표로 옮긴다.
-- ─────────────────────────────────────────────

alter table public.profiles
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists marketing_consent_at timestamptz;

comment on column public.profiles.marketing_consent is
  '광고성 정보 수신 동의 (정보통신망법 §50). 선택 항목 — 가입 조건으로 쓰지 않는다.';
comment on column public.profiles.marketing_consent_at is
  '동의 또는 철회한 시각. 동의/철회 양쪽 다 이 칸을 갱신한다 — 증적.';
