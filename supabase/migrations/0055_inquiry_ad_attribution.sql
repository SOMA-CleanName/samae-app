-- 0055 · 문의에 Meta 광고 식별자 보관
-- 리드 언락 모델(0035)에서 입금 확인(status='confirmed')을 누르는 주체는 운영자다.
-- 그 요청의 쿠키·IP·UA 는 운영자의 것이므로, 그 시점엔 고객이 어떤 광고를 타고
-- 들어왔는지 되짚을 수 없다. 그래서 문의 접수 시점에 광고 식별자를 함께 남긴다.
--
--   _fbp : Meta 픽셀이 심는 브라우저 식별자
--   _fbc : 광고 클릭 시 URL 의 fbclid 로부터 픽셀이 생성 (광고↔리드 연결 고리)
--
-- 둘 다 픽셀 JS 가 만드는 non-httpOnly 쿠키라 서버 액션에서 읽힌다.
-- 픽셀 미로딩 환경(로컬·픽셀 ID 미설정)에선 null 로 남는다.
--
-- 용도: 작가가 리드를 구매(confirmed)했을 때 Meta 로 "팔린 리드" 신호를 되먹여
--       '문의를 넣는 사람'이 아니라 '작가가 돈 주고 살 문의를 넣는 사람'으로 학습시킨다.
--       (전송 자체는 전환 볼륨 확보 후 별도 작업)

alter table public.inquiries
  add column if not exists fbp text,
  add column if not exists fbc text;

comment on column public.inquiries.fbp is 'Meta 픽셀 브라우저 식별자(_fbp 쿠키). 접수 시점 스냅샷.';
comment on column public.inquiries.fbc is 'Meta 광고 클릭 식별자(_fbc 쿠키, fbclid 유래). 접수 시점 스냅샷.';
