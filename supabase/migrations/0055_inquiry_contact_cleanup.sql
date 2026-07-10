-- 문의 연락 모델 정리 — 전화/카톡/이메일 3채널로 축소.
-- · discord_id(카톡 저장용으로 재활용되던 컬럼) → kakao_id 정식 리네임
-- · instagram_id / extra_contact 폐지 (더 이상 수집 안 함)
-- · contact_email 정상 사용 (기존엔 항상 null 삽입되던 죽은 컬럼)
-- · party_size int → text (선택 라벨 "3~6명"·"그 이상" 보존)
-- · name(이름/닉네임) 컬럼 신설, gender 는 기존 컬럼을 폼이 채우기 시작

begin;

-- 1. discord_id → kakao_id (데이터 보존, 제약조건 참조는 rename 시 자동 갱신)
alter table inquiries rename column discord_id to kakao_id;

-- 2. 컬럼 삭제 전 기존 contact_check 먼저 제거(삭제할 컬럼을 참조하므로)
alter table inquiries drop constraint if exists inquiries_contact_check;

-- 3. 이메일 형태의 extra_contact → contact_email 백필
update inquiries
   set contact_email = extra_contact
 where contact_email is null
   and extra_contact ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';

-- 4. 폐지될 채널(인스타/비이메일 기타)에만 담겨있던 연락처는 유실 방지로 note 에 보존
update inquiries
   set note = nullif(
        trim(both ' /' from concat_ws(' / ',
          note,
          case when instagram_id is not null then '인스타: ' || instagram_id end,
          case when extra_contact is not null
                and coalesce(contact_email, '') <> extra_contact
               then '기타: ' || extra_contact end)), '')
 where instagram_id is not null
    or (extra_contact is not null and coalesce(contact_email, '') <> extra_contact);

-- 5. 죽은 컬럼 삭제
alter table inquiries drop column instagram_id;
alter table inquiries drop column extra_contact;

-- 6. party_size int → text (기존 정수값은 "N명" 라벨로 캐스팅, 이후엔 폼 라벨 그대로 저장)
alter table inquiries
  alter column party_size type text
  using (case when party_size is null then null else party_size::text || '명' end);

-- 7. 이름/닉네임 컬럼 (선택 입력)
alter table inquiries add column name text;

-- 8. 연락 수단 최소 1개 제약 재정의 — 전화/카톡/이메일 기준.
--    기존 행(폐지 채널만 있던 리드)까지 소급 검증하면 실패하므로 신규 행에만 적용(not valid).
alter table inquiries
  add constraint inquiries_contact_check
  check (phone is not null or kakao_id is not null or contact_email is not null)
  not valid;

commit;
