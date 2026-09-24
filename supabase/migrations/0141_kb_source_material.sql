-- ─────────────────────────────────────────────
-- 0141. 작가 원본 자료 보관 — **다시 정리할 수가 없었다.**
--
-- 카드는 작가가 보낸 자료(노션·카톡·메모)를 읽어 만든다. 그런데 그 자료를 아무 데도
-- 남기지 않아서, 작가가 패키지를 고친 뒤 "갱신 필요" 가 떠도 고칠 방법이 없었다 —
-- 운영이 그 작가의 원문을 어딘가에서 다시 찾아 붙여넣어야 했다.
--
-- 자료를 같이 두면 저장된 자료 + 지금 패키지로 **다시 추출**할 수 있다.
--
-- ⚠️ 봇에 주입하지 않는다. 봇이 보는 건 cards 뿐이다 — 원문에는 오프플랫폼 유도나
--    환불 문구가 섞여 있고, 그래서 애초에 카드로 만들지 않고 걸러낸 것들이다.
-- ─────────────────────────────────────────────

alter table public.photographer_bot_kb
  add column if not exists source_material text not null default '',
  add column if not exists source_saved_at timestamptz;

comment on column public.photographer_bot_kb.source_material is
  '카드를 만들 때 쓴 작가 원본 자료. 다시 정리(재추출)용 — 봇에 주입하지 않는다.';
comment on column public.photographer_bot_kb.source_saved_at is
  '그 자료를 저장한 시각. 카드(updated_at)보다 오래됐으면 자료가 낡았다는 뜻.';
