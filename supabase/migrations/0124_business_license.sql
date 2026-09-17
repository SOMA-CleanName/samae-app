-- ─────────────────────────────────────────────
-- 0124. 사업자등록증 — 비공개 스토리지 + 확인 기록
--
-- 왜 필요한가. 지금은 사업자등록번호만 받는데, 번호만으로는 우리가 할 일을 못 한다.
--
--   · 세금계산서를 발급할 수 없다. 우리는 작가에게 수수료 세금계산서를 발급한다고
--     약관에 적어 뒀다(작가 이용약관 제14조 2항). 필수 기재사항은 등록번호 + 상호 +
--     대표자 성명인데, 입력받은 상호가 등록증의 상호와 같은지 대조할 방법이 없었다.
--     틀리면 발급한 계산서가 무효가 된다.
--   · 번호의 진위는 국세청 조회로 알 수 있지만 **소유자는 확인되지 않는다.**
--     남의 번호를 적어도 통과한다.
--   · 전자상거래법 20조는 중개자에게 중개의뢰자 신원정보의 **확인**을 요구한다.
--     "입력받았다" 가 아니라 "확인했다" 가 요건이다.
--
-- ⚠️ 공개 버킷을 쓰지 않는다. 사업자등록증에는 대표자 성명과 사업장 주소가 들어 있다.
--    samae-portfolio 처럼 public=true 로 두면 경로만 알면 누구나 받아 간다.
--    업로드는 서버(service_role)가, 열람은 어드민 요청 시 만료형 서명 URL 로만 한다.
--    그래서 storage 정책을 따로 두지 않는다 — 클라이언트가 직접 닿을 길이 없다.
-- ─────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('samae-license', 'samae-license', false)
on conflict (id) do nothing;

alter table public.photographers
  -- 버킷 내 경로. 원본 파일명은 쓰지 않는다 — 이름에 개인정보가 담겨 오는 일이 잦다
  add column if not exists business_license_path text,
  add column if not exists business_license_uploaded_at timestamptz,
  -- 어드민이 등록증과 입력값(상호·대표자·번호)을 눈으로 대조한 기록.
  -- 누가 언제 봤는지가 남아야 "확인했다" 가 말이 된다.
  add column if not exists business_license_verified_at timestamptz,
  add column if not exists business_license_verified_by uuid
    references public.profiles(id) on delete set null,
  -- 반려 사유 등 메모. 확인이 안 된 이유가 남아야 작가에게 뭘 다시 받을지 안다
  add column if not exists business_license_note text;

-- FK 가 걸린 컬럼에는 인덱스를 함께 만든다. 없으면 profiles 한 행을 지울 때마다
-- 이 테이블을 통째로 훑는다 — 0122 에서 회원 탈퇴가 시간 초과로 죽은 그 이유다.
create index if not exists photographers_business_license_verified_by_idx
  on public.photographers (business_license_verified_by);
