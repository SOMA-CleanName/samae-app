-- 0057 · 문의 유입 어트리뷰션(UTM·랜딩) 저장
-- 기존엔 fbp/fbc(광고 클릭 ID)만 저장돼 있었는데, fbclid 는 인스타 인앱 브라우저가
-- 오가닉 링크 클릭에도 자동으로 붙여서 'fbc 있음'만으로는 광고/스토리를 구분 못 한다.
-- 정확한 판별 신호인 utm_medium(paid_social=유료광고 · social=오가닉 스토리 등)과
-- 랜딩 경로를 접수 시점에 함께 저장한다. (읽기 전용 분석/어드민 표기용)
alter table public.inquiries
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content  text,
  add column if not exists utm_term     text,
  add column if not exists landing_path text;
