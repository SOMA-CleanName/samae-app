-- 작가 입점 동의 — 문서별 열람·동의 증적 (docs/35, 약관규제법 3조)
--
-- 지금까지 남은 건 `versions` 묶음 하나와 `agreed_at` 하나뿐이었다. 그러면
-- "네 문서에 동의했다" 까지만 말할 수 있고 **"어느 문서를 언제 읽고 언제 동의했는가"**
-- 는 말할 수 없다. 약관규제법 3조에서 사업자가 대는 근거가 "읽을 기회를 줬다" 인데,
-- 그 기회가 실제로 주어졌다는 증거가 없으면 기록이 있어도 다툼에서 쓸 수가 없다.
--
-- 모양:
--   {"contract": {"openedAt": "...Z", "agreedAt": "...Z", "version": "2.0"}, ...}
--
-- jsonb 로 두는 이유 — 문서가 늘거나 빠질 때 스키마를 따라 바꾸지 않아도 된다.
-- 대신 키 집합의 진실은 코드(components/legal/photographerDocs)에 있다.

alter table public.photographer_agreements
  add column if not exists doc_records jsonb;

comment on column public.photographer_agreements.doc_records is
  '문서별 열람·동의 증적 {key: {openedAt, agreedAt, version}}. 전문을 끝까지 연 시각과 동의 시각을 따로 남긴다';
