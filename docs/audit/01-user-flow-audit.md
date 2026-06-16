# 사용자(고객) 플로우 전수 감사 — samae-app

> 감사 기준일: 2026-06-16 · 대상: `main` (커밋 c7e8256) · 범위: 사용자(고객) 페르소나 전 플로우
> 방식: 소스/마이그레이션을 직접 읽어 `파일:라인` 근거로 추적. **코드 무수정(read-only).**
> 스택: Next.js 16 App Router + Supabase(Postgres/RLS/Auth/Storage/Realtime), 직접 계좌이체 + 리드 언락 모델.

---

## 요약 (심각도별 카운트 + 치명/높음 목록)

| 심각도 | 건수 |
|--------|------|
| 치명   | 3 |
| 높음   | 8 |
| 중간   | 9 |
| 낮음   | 7 |

### 치명 (즉시 조치)
1. **문의 제출 즉시 알림 본문에 고객 연락처(전화/인스타/기타)가 평문 노출** — 리드 언락(입금 확인 후 공개) 모델을 완전히 우회. `src/app/(user)/inquiry/actions.ts:244-257` + `:230-237`
2. **`inquiries` 테이블에 SELECT/INSERT/UPDATE RLS 정책이 전혀 없음(RLS만 켜짐)** — 설계상 service-role 전용이나, 정책 부재로 알림 본문 외 어떤 보호도 RLS에 의존 불가. 향후 클라이언트 직접 접근 추가 시 즉시 사고. `supabase/migrations/0029_inquiries.sql:41`
3. **reviews RLS가 "본인+완료 예약" 을 강제하지 않음 → 후기/별점 위조 가능** `supabase/migrations/0001_init.sql:465-466`

### 높음
4. 오픈 리다이렉트: `auth/callback`의 `next` 미검증 `src/app/auth/callback/route.ts`
5. 오픈 리다이렉트: `auth/confirm`의 `next` 미검증 `src/app/auth/confirm/route.ts`
6. `deliverFinals` 상태 전이가 조건부 UPDATE 가드 없음(TOCTOU) `src/app/actions/payments.ts:180-183`
7. `refundBooking` 상태 전이가 조건부 UPDATE 가드 없음(TOCTOU) `src/app/actions/payments.ts:335-347`
8. `acceptBooking` 시 슬롯 점유 비원자화 → 동시 수락 시 이중 부킹 `src/app/actions/bookings.ts:243-265`
9. `/api/track` 미인증 공개 POST + service-role insert → 익명 스팸 적재 벡터 `src/app/api/track/route.ts:20-87`
10. 이메일 가입 차단이 클라이언트 플래그뿐 — 서버/Supabase 설정 미강제 `src/app/(auth)/signup/page.tsx:11`
11. 작가 수취 계좌가 수락 전·채팅 진입만으로 서버 응답에 포함 `src/app/(user)/chat/[conversationId]/page.tsx:41-43`

---

## 플로우별 상세

### 1. 회원가입 / 로그인 / 이메일 인증 / 세션

검증 결과 (양호):
- 신뢰 결정에 `getUser()` 사용 — `src/lib/auth.ts:23`, `src/lib/supabase/middleware.ts:35`. 권한 판단에 `getSession()`을 쓰는 곳 없음(예외: `/api/track`만 getSession, 신뢰 결정 아님).
- `role`은 서버에서 `profiles` 테이블 조회로만 결정 — `src/lib/auth.ts:26-30` (`server-only`). 클라이언트 role 주입 경로 없음.
- service-role 클라이언트는 `server-only`로 격리 — `src/lib/supabase/admin.ts:1`.
- 가입 시 `handle_new_user()` 트리거가 `profiles` 자동 생성 — `0001_init.sql:49-65, 340-342`.

#### [심각도: 높음] auth/callback `next` 파라미터 오픈 리다이렉트
- 위치: `src/app/auth/callback/route.ts` (`next = searchParams.get("next")` → `${origin}${next}`)
- 플로우/현상: 카카오 로그인 콜백 직후 `next` 값을 검증 없이 리다이렉트.
- 원인: `//evil.com`, `/\evil.com` 등은 브라우저가 외부로 해석 → origin 접두가 무력화.
- 영향: 로그인 직후 피싱 유도(오픈 리다이렉트).
- 제안 수정: `next`가 `/`로 시작하고 `//`·`/\`·스킴 미포함인 내부 경로일 때만 허용, 아니면 `/`로 폴백. `new URL(next, origin).origin === origin` 검증.

#### [심각도: 높음] auth/confirm `next` 파라미터 오픈 리다이렉트
- 위치: `src/app/auth/confirm/route.ts`
- 현상/원인/영향: 위와 동일(verifyOtp 후 외부 도메인 리다이렉트 가능).
- 제안 수정: 동일한 내부 경로 검증 적용.

#### [심각도: 높음] 이메일 가입 차단이 UI 게이트만 존재
- 위치: `src/app/(auth)/signup/page.tsx:11` (`EMAIL_SIGNUP_ENABLED = false` 클라이언트 상수), 로그인 폼 `login/page.tsx`
- 플로우/현상: 카카오 전용 가입 의도지만 `signUp({email,password})` 코드는 그대로 존재. 콘솔/직접 호출로 anon 키 가입 가능.
- 원인: 차단이 렌더 분기뿐, 서버 액션·Supabase provider 설정 미반영.
- 영향: 임의 이메일 계정 대량 생성 → 트리거로 `profiles` 자동 생성 → 스팸 계정 누적(미인증 auth.users + profiles).
- 제안 수정: Supabase 대시보드에서 이메일 회원가입 비활성화, 또는 가입을 서버 액션으로 옮겨 플래그를 서버에서 검사.

#### [심각도: 중간] code 교환 실패 원인 무시(swallow)
- 위치: `src/app/auth/callback/route.ts` (`if (code)` 블록의 error 미로깅, 통합 `/login?error=auth`)
- 영향: 카카오 로그인 간헐 실패 원인 추적 불가. OAuth provider 거부(`error`/`error_description` 쿼리)도 미처리.
- 제안 수정: 에러 로깅 + provider 측 거부 쿼리 처리.

#### [심각도: 낮음] `getCurrentUser`가 `.single()` 사용 — profiles 누락 시 silent 에러
- 위치: `src/lib/auth.ts:26-30`
- 현상: 트리거 실패/경합으로 profiles 미존재 시 `.single()`은 에러, 코드는 `profile?.role ?? "user"`로 폴백(권한 축소 방향이라 보안상 안전하나 추적 불가).
- 제안 수정: `.maybeSingle()` + null 로깅/보정.

#### [심각도: 낮음] 로그인 후 `next` 미반영 (deep-link 복귀 불가)
- 위치: `src/app/(auth)/login/page.tsx` (성공 시 `router.push("/")` 고정)
- 영향: 보안 아님, UX 결함. 보호 페이지 복귀 불가.

---

### 2. 탐색: 갤러리 / 필터 / 검색 / 찜

검증 결과 (양호):
- 갤러리/카테고리/검색 쿼리가 `photos↔photographers` FK 모호성을 `photographers!photos_photographer_id_fkey!inner`로 명시 — `src/lib/discovery.ts:57,79,107,190,314,335`. PostgREST 임베드 모호성 없음.
- `!inner` + RLS(`photos_select`: published 또는 본인/관리자)로 미승인 작가 사진 자동 제외 — `0001_init.sql:415-416`.
- 검색어 sanitize로 PostgREST or-필터 인젝션 차단 — `discovery.ts:41-43`.
- 찜 토글은 본인 행만(RLS `favorites_all`), 비로그인은 로그인 유도 — `src/app/(user)/actions.ts:8-40`.

#### [심각도: 중간] `favorites.target_id` 폴리모픽 컬럼에 FK 없음 → 고아 레코드·무결성 부재
- 위치: `supabase/migrations/0001_init.sql:173-180`, 쓰기: `src/app/(user)/actions.ts:35,69`
- 플로우/현상: 사진/작가 찜은 `target_type` + `target_id(uuid)` 폴리모픽. FK가 없어 존재하지 않는 id도 찜 가능하고, 사진/작가 삭제 시 favorites 행이 cascade 정리되지 않음(고아 누적).
- 원인: 폴리모픽 연관(단일 컬럼으로 두 테이블 참조)이라 선언적 FK 불가.
- 영향: 데이터 증가 시 고아 favorites 누적, 삭제된 대상에 대한 찜 수(`photographer_favorite_count`/`photo_like_count`)가 부풀려질 수 있음.
- 제안 수정: 삭제 트리거로 favorites 정리, 또는 `favorite_photographers`/`favorite_photos`로 분리해 FK+ON DELETE CASCADE 부여.

#### [심각도: 낮음] 검색/추천이 "최근 N건 받아서 JS 필터·셔플" 방식 — 데이터 증가 시 누락
- 위치: `discovery.ts:99-116`(`searchPhotosByTag` limit 200 후 JS 필터), `:325-365`(추천)
- 현상: published 사진이 200건↑로 늘면 오래된 사진은 검색/추천 후보에서 누락(주석에 "베타 한정"으로 명시됨).
- 영향: 현 시점 무해, 미래 데이터 증가 시 검색 품질 저하.
- 제안 수정: tag 부분일치를 DB측(`tsvector`/`pg_trgm` 또는 정규화 태그 테이블)으로 이전.

---

### 3. 카테고리 랜딩 (/c/[slug])

검증 결과 (양호):
- `categories` RLS: `published or is_admin()` 조회, 관리만 admin — `0037_categories.sql:22-28`. 비공개 카테고리 미노출 정상.
- `fetchPhotosByTags`가 `overlaps(mood_tags, tags)` + 매칭 태그 수 정렬 — `discovery.ts:73-96`. RLS로 published만.
- 이상 없음. (단, slug 미존재 시 페이지 처리는 4번 동일 패턴 — page.tsx에서 notFound 확인 필요하나 데이터 누출은 없음)

---

### 4. 작가 프로필 열람 (/photographers/[id])

검증 결과 (양호):
- `fetchPhotographerById`가 `.eq("status","approved")` — 미승인 작가 프로필 비노출 `discovery.ts:368-377`.
- 공개 사진·활성 패키지만 노출 `discovery.ts:380-402`.
- 이상 없음.

---

### 5. 문의 폼 제출 → 알림

#### [심각도: 치명] 문의 제출 즉시 알림 본문에 고객 연락처 평문 노출 (리드 언락 우회)
- 위치: `src/app/(user)/inquiry/actions.ts:244-257`(`buildInquiryBody`가 phone/instagram/extraContact를 본문에 삽입), `:230-237`(status='new'로 INSERT되는 시점에 알림 생성)
- 플로우/현상: 고객이 문의 폼 제출 → 그 즉시 작가에게 `notifications` 행 생성. 본문에 `전화번호: 010-...`, `인스타: @...`, `기타 연락처: ...` 가 평문으로 들어감. 이 알림은 작가가 `recipient_id = auth.uid()` RLS로 항상 읽을 수 있음(`0001_init.sql:471`).
- 원인: 연락처 비공개 로직은 `src/lib/inquiries.ts:88-97`에서 `status==='confirmed'`(운영자 입금 확인)일 때만 노출하도록 정교하게 구현돼 있으나, **알림 본문 경로가 이 게이트를 완전히 우회**. 문의는 `status='new'`(미수락·미입금) 상태로 저장되는데 알림엔 이미 전부 노출됨.
- 영향: 작가가 수락·입금 없이 모든 고객 연락처를 알림함에서 무료 수집 가능 → 플랫폼의 핵심 수익 모델(건당 6,000원 리드 언락) 붕괴 + 개인정보 조기 노출.
- 제안 수정: 알림 본문에서 연락처 라인 제거(브리프 요약만: 목적/일정/지역/인원). 연락처는 `confirmed` 후 `listMyAcceptedInquiries` 경로로만 노출. 제출 성공 메시지(`actions.ts:176` "작가에게 연락처가 전송되었습니다")도 모델과 모순되므로 수정.

#### [심각도: 치명] `inquiries` 테이블 RLS 정책 전무 (RLS 활성만)
- 위치: `supabase/migrations/0029_inquiries.sql:41` (RLS enable), 전 마이그레이션에 inquiries SELECT/INSERT/UPDATE 정책 없음
- 플로우/현상: inquiries에 대한 모든 CRUD는 service-role(`createAdminClient`)로만 수행됨 — `inquiries.ts`, `inquiry/actions.ts`, `studio/actions.ts`, `admin/inquiries/actions.ts`. anon/authenticated 직접 접근은 RLS 기본거부로 전부 차단(현재는 의도대로 동작).
- 원인: 명시적 거부가 아니라 "정책 부재로 인한 암묵적 거부". 향후 누군가 편의상 inquiries에 클라이언트 쿼리/임베드를 추가하면 정책이 없어 즉시 전면 노출되거나, 반대로 정책을 잘못 추가하면 연락처가 평문 컬럼이라 바로 누출.
- 영향: 연락처가 컬럼 레벨 분리 없이 한 테이블에 평문 저장(phone/instagram/discord/contact_email/extra_contact). RLS 한 줄 실수로 전 고객 연락처 유출. 알림 임베드를 service-role로 우회 처리(`notifications.ts:37-48`)하는 것도 이 정책 부재 때문.
- 제안 수정: 명시적 deny 의도를 주석/정책으로 고정(예: select using(false) for authenticated 외 admin만). 연락처 컬럼을 별도 테이블/뷰로 분리해 컬럼 레벨 노출 통제.

검증 결과 (양호):
- 연락 수단 1개 이상·필수 브리프(인원/목적/일정) 서버 검증 — `inquiry/actions.ts:73-91`.
- 전화번호 정규식 검증·정규화 — `:52-66`.
- 레퍼런스 이미지: sharp 재인코딩(jpeg 강제)·15MB·5장 제한·`randomUUID` 경로 — `:259-288`.

#### [심각도: 중간] 비로그인 문의 시 contact를 profiles에 못 쓰지만, 로그인 시 `phone`을 항상 덮어씀
- 위치: `inquiry/actions.ts:155-165`
- 현상: 로그인 사용자가 문의하면 `profiles.phone`/`instagram_id`를 입력값으로 무조건 update. 사용자가 다른 사람 대신 연락처를 넣으면 본인 프로필이 오염됨.
- 제안 수정: 문의 연락처와 프로필 연락처를 분리하거나, 빈 값일 때만 보강.

---

### 6. 채팅: 메시지 / 사진 / 안읽음 / 나가기

검증 결과 (양호):
- 메시지 RLS: 참여자만 select/insert(`is_conversation_participant`) — `0001_init.sql:440-443`.
- 작가 시점 고객 이름 보강은 admin으로 **display_name만**(phone 미노출), 이미 RLS로 참여 확인된 대화 한정 — `src/lib/chat.ts:62-75`, `src/lib/bookings.ts:55-68`.
- consultation_briefs RLS: 참여자 읽기 / 고객만 쓰기 — `0015_consultation_brief.sql:24-56`.
- `getOrCreateConversation` 자기 자신과 대화 차단 — `src/lib/conversations.ts:13`.

#### [심각도: 높음] 작가 수취 계좌가 수락 전·채팅 진입만으로 서버 응답에 포함
- 위치: `src/app/(user)/chat/[conversationId]/page.tsx:41-43`, `src/lib/payments.ts:133-143`(`getPhotographerPayoutAccount`)
- 플로우/현상: 고객이 채팅방 진입 시 무조건 작가 계좌(은행/번호/예금주)를 받아 클라이언트로 내려보냄. UI는 `status==='accepted'`일 때만 렌더하나 HTML/응답엔 포함.
- 영향: 예약·수락 없이 대화 참여만으로 작가 계좌 수집 가능(사칭/피싱 소지).
- 제안 수정: 계좌 fetch를 수락된 예약 존재 시에만, 또는 별도 액션으로 지연 로딩(`getPayoutAccountForBooking`처럼 예약 게이트).

#### [심각도: 중간] 채팅 나가기 — 완료/거절 거래 대화를 일방이 영구 삭제
- 위치: `src/app/(user)/chat/actions.ts`(`leaveConversation`), `src/lib/soft-delete.ts`
- 현상: requested 상태는 보호되나, 거절/취소/환불/완료 후엔 한쪽이 나가면 messages/consultation_briefs/conversations를 상대 동의 없이 영구 삭제(아카이브는 되나 상대 화면에서 소멸).
- 영향: 완료 거래의 대화 증빙이 일방에 의해 제거 → 분쟁 시 불리.
- 제안 수정: 완료 거래가 있으면 per-side 숨김(hidden_at)으로 일원화.

#### [심각도: 중간] unread 카운트 경쟁 — markRead와 수신 메시지 충돌 시 누락
- 위치: `supabase/migrations/0004_chat.sql:22,28`(`+1` 트리거), `chat/actions.ts`(markRead 0 리셋)
- 현상: 메시지 수신과 markRead가 경쟁하면 방금 온 메시지 카운트가 0으로 덮여 안읽음 누락 가능.
- 제안 수정: last_read_at 타임스탬프 기반 읽음 처리로 전환.

#### [심각도: 중간] 채팅 이미지 업로드 — Content-Type만 신뢰, 매직바이트 미검증
- 위치: `src/app/api/chat/upload/route.ts:20`, `src/app/api/brief/route.ts:103`
- 현상: `file.type.startsWith("image/")`는 클라이언트 헤더만 신뢰. sharp 재인코딩이 사실상 방어하나 svg 등 엣지케이스 존재. 경로는 `randomUUID`라 traversal 없음(양호).
- 제안 수정: sharp metadata format 화이트리스트/매직바이트 sniff 추가(현 위험도 낮음).

#### [심각도: 낮음] Realtime bookings 구독에 row 필터 없음 — RLS 의존
- 위치: `src/app/(user)/chat/[conversationId]/ChatRoom.tsx`(bookings UPDATE 구독), `0017_bookings_realtime.sql`
- 현상: `{event:'UPDATE', table:'bookings'}` 구독에 필터 없음. payload는 전체 컬럼이나 RLS(`bookings_select`=참여자/작가/admin)로 수신 제한 → 현행 누출 아님.
- 제안 수정: realtime RLS 게이팅 회귀 테스트 추가.

---

### 7. 예약 제안 수신 / 날짜 (BookingComposer / bookings)

#### [심각도: 높음] `acceptBooking` 슬롯 점유 비원자화 → 동시 수락 시 이중 부킹
- 위치: `src/app/actions/bookings.ts:243-265`
- 현상: 수락 시 시간 충돌을 select 비교로만 검사하고 `availability.is_booked`/`bookings.availability_id`를 세팅하지 않음. 검사-후-쓰기 사이 원자성 없음 → 거의 동시 두 수락이 둘 다 통과.
- 영향: 같은 시간대 중복 예약 체결. (환불 경로 `payments.ts:368`는 항상 null인 `availability_id`로 슬롯 해제 시도 → 무의미)
- 제안 수정: 슬롯을 `availability` 조건부 UPDATE(`is_booked=false→true`)로 원자화하거나 bookings 시간겹침 exclusion 제약.

#### [심각도: 낮음] `proposeBooking` 패키지 소유자 검증 부재
- 위치: `src/app/actions/bookings.ts:82-93`
- 현상: `packageId` 조회 시 해당 작가의 패키지인지 미검증. 타 작가 패키지 id를 넣으면 그 가격/스냅샷으로 예약 생성 가능(UI는 노출 안 하나 폼 위조 가능).
- 제안 수정: `.eq("photographer_id", conv.photographer_id)` 추가.

#### [심각도: 낮음] `updateBooking` 수정 권한 비대칭 (구매자만)
- 위치: `src/app/actions/bookings.ts:157`
- 현상: 작가 제안건도 구매자만 수정 가능. 보안 위험 아님, 상태머신/UX 비대칭.

검증 결과 (양호):
- bookings update 클라이언트 정책 없음 → 전이는 service-role only — `0001_init.sql:388-389, 425-429`.
- `markTransferSent`(`transfer_marked_at is null` + `status='accepted'` 조건부)·`confirmBankTransfer`(`.eq("status","accepted")` + payments/platform_fees `onConflict:booking_id`)는 멱등·이중결제 방지 정상 — `payments.ts:59-66`, `src/lib/payments.ts:190-224`.

---

### 8. 입금 → 운영자 확인 → 연락처 열람 (리드 언락 게이팅)

검증 결과 (의도된 게이트는 정상 구현, 단 5번/6번 치명 우회 존재):
- `listMyAcceptedInquiries`가 `status==='confirmed'`일 때만 연락처 반환, 그 외 null — `src/lib/inquiries.ts:88-97`. **이 경로 자체는 정확.**
- `confirmInquiryDeposit`: `accepted→confirmed` 조건부 UPDATE(`.eq("status","accepted")`) + admin 가드 — `admin/inquiries/actions.ts:45-76`.
- `revertInquiryDeposit`: `confirmed→accepted` 정정 — `:79-90`.
- `acceptInquiry`/`acceptInquiryNotifications`: `new→accepted` 조건부 + photographer 가드 — `studio/actions.ts:211-235`, `notifications/actions.ts`.
- platform_account 조회는 로그인 사용자 가능, 변경은 admin — `0035:40-46`.

**그러나** 5번(알림 본문 연락처 노출)으로 인해 이 게이트는 실질적으로 우회된다. 게이트의 정합성은 좋으나 진입점 하나가 새는 구조.

#### [심각도: 중간] `deposit_amount_krw` 기본값 6000 하드코딩, 작가별/카테고리별 차등 불가
- 위치: `0035_inquiry_deposit.sql:13`
- 현상: 리드 언락 수수료가 컬럼 기본값으로만 존재. 운영 정책 변경 시 신규 행만 반영.
- 제안 수정: platform 설정 테이블 참조 또는 운영자 일괄 변경 경로.

---

### 9. 예약 내역 (/bookings)

#### [심각도: 높음] `deliverFinals` 상태 전이 TOCTOU (조건부 UPDATE 가드 없음)
- 위치: `src/app/actions/payments.ts:180-183`
- 현상: select로 `paid|shot` 확인 후 `update(...).eq("id",id)`만 — WHERE에 선행 상태 가드 없음. 다른 전이 함수(markShot/confirmCompletion 등)는 모두 조건부 UPDATE인데 이것만 read-then-write.
- 영향: 환불·취소와 경쟁 시 refunded→completed 역전 등 상태머신 붕괴.
- 제안 수정: `.in("status",["paid","shot"])`를 UPDATE WHERE에 포함, 0행이면 에러.

#### [심각도: 높음] `refundBooking` 상태 전이 TOCTOU
- 위치: `src/app/actions/payments.ts:335-347`
- 현상: select 후 `update({status:'refunded'}).eq("id",id)` — 선행 상태 가드 없음.
- 영향: 동시 환불/전달완료 시 이중 처리(수수료 면제·결제 표시 중복/역전).
- 제안 수정: `.in("status",["paid","shot","delivered"])`를 WHERE에 포함, 0행이면 중단.

검증 결과 (양호):
- 예약 목록/상세 RLS: 구매자 또는 해당 작가만 — `0001_init.sql:426-427`. 작가 시점 고객 이름은 admin으로 display_name만 보강(민감정보 미노출) — `src/lib/bookings.ts:55-68`.

---

### 10. 알림 (리다이렉트 전용)

검증 결과 (양호):
- 알림 조회 RLS: 본인 수신만 — `0001_init.sql:471-472`.
- 채팅 알림(type='chat')은 센터에서 제외(배지로 대체) — `src/lib/notifications.ts:19-30`.
- 문의 상태는 inquiries RLS 부재로 임베드 불가 → service-role로 따로 조회·머지 — `notifications.ts:37-48` (정책 부재의 우회책, 2번 항목과 연결).
- '수락 대기' 알림은 수락 후 숨김 — `notifications.ts:56-59`.

#### [심각도: 낮음] 알림 본문에 연락처를 저장하는 구조 자체가 PII 잔존 위험
- 위치: `inquiry/actions.ts:230-237`(5번과 동일 근본)
- 현상: 알림은 단순 리다이렉트용이어야 하나 본문에 PII를 보존. 알림은 삭제 정책이 없어 누적.
- 제안 수정: 알림 본문은 식별 불가 요약만, PII는 inquiries(게이트된 경로)에서만.

---

### 11. 설정 / 회원탈퇴

검증 결과 (대체로 양호):
- 닉네임/아바타 수정은 본인 RLS — `settings/actions.ts:11-43`.
- 탈퇴 시 진행 중 예약(`accepted/paid/shot/delivered`) 있으면 차단 — `:46,67-71`.
- RESTRICT 자식(platform_fees/payments/bookings) 아카이브 후 삭제 → profiles 삭제(나머지 CASCADE) → auth.users 삭제 — `:73-85`. 소프트딜리트로 복구 가능(`0039`).

#### [심각도: 중간] 탈퇴 시 `requested` 예약·진행 대화가 남거나 상대 데이터 영향
- 위치: `src/app/(user)/settings/actions.ts:46`(ACTIVE에 `requested` 미포함), `:60-79`
- 현상: `requested`(미수락) 예약은 차단 대상이 아니라 archiveAndDelete로 삭제됨. 그 예약과 연결된 작가 측 알림/대화 맥락이 끊김. 또 `bookings.user_id`/`photographer_id`는 `ON DELETE RESTRICT`(`0001:185-186`)인데 profiles 삭제 전 bookings를 먼저 지우므로 OK이나, 상대(작가)의 예약 목록에서 거래가 통째로 사라짐(아카이브만 남음).
- 영향: 상대방 입장에서 진행 맥락 소실.
- 제안 수정: 상대 측 거래는 'cancelled'로 전이 후 보존하거나, 탈퇴자 식별만 익명화.

#### [심각도: 중간] inquiries는 profile_id `ON DELETE SET NULL`로 잔존 — 연락처 PII가 탈퇴 후에도 남음
- 위치: `0029_inquiries.sql:6`(`profile_id ... on delete set null`)
- 현상: 회원 탈퇴 시 inquiries 행은 삭제되지 않고 profile_id만 null(리드 모델상 의도). 그러나 phone/instagram 등 PII 컬럼은 그대로 남아 작가/운영자가 계속 열람 가능.
- 영향: 탈퇴(개인정보 삭제 요청) 후에도 연락처 PII 잔존 → 개인정보보호 컴플라이언스 위반 소지.
- 제안 수정: 탈퇴 시 본인 inquiries의 연락처 컬럼 마스킹/삭제.

---

### 12. 행동분석 트래킹 (사용자 페이지 한정 여부)

검증 결과 (페이지 한정은 정상):
- `AnalyticsTracker`는 root `app/layout.tsx`에 마운트되나 `isTracked()`로 `/admin`·`/studio` 제외 — `src/components/AnalyticsTracker.tsx:10-13, 117, 128`.
- 서버 `/api/track`도 `isCustomerPath()`로 admin/studio 행 필터(이중 가드) — `src/app/api/track/route.ts:16-18, 71`.
- analytics_events 조회는 admin만, anon 쓰기 미허용(테이블 RLS) — `0036:23-25`.

#### [심각도: 높음] `/api/track` 미인증 공개 POST + service-role insert → 익명 스팸 적재
- 위치: `src/app/api/track/route.ts:20-87`
- 플로우/현상: 인증·오리진·레이트리밋 없이 누구나 POST하면 service-role로 `analytics_events`에 최대 30행/요청 insert. 세션당 검증도 sessionId(클라이언트 임의 문자열)뿐.
- 영향: 무한 적재 → analytics_events 테이블 폭증(스토리지·비용), 통계 오염, Sheets webhook 스팸 forward.
- 제안 수정: 오리진/Referer 검증, IP 또는 세션 레이트리밋, payload 상한(이미 30/64자 제한은 있음) 강화.

#### [심각도: 중간] `/api/track`가 `getSession()` 사용 (다른 경로는 getUser)
- 위치: `src/app/api/track/route.ts:53`
- 현상: profile_id 첨부용으로 `getSession()` 사용. 신뢰 결정은 아니라 영향은 낮으나, getSession은 쿠키 위조에 취약한 패턴이라 일관성 차원에서 부적절.
- 제안 수정: profile_id가 분석 귀속에만 쓰이면 수용 가능하나 주석 명시 권장.

---

## 부록: 관계형 무결성 / ERD 관점 종합

- **폴리모픽 favorites**(2-2번): FK·cascade 부재 → 고아 누적. 정규화 분리 권장.
- **inquiries PII 평문 + RLS 정책 부재**(치명 2): 컬럼 분리 또는 뷰 게이팅 필요.
- **알림 본문 PII 잔존**(치명 1, 낮음): notifications에 PII 저장 금지 원칙 필요. notifications 삭제/보존 정책 부재 → 무한 누적.
- **availability_id 미사용**: bookings.availability_id가 항상 null인데 환불 로직이 이를 참조(8번/이중부킹). 슬롯 모델 일관화 필요.
- **deleted_records 누적**: 소프트딜리트가 모두 한 테이블에 jsonb로 적재(`0039`). 보존기간/파기 정책 없으면 무한 증가 + PII 장기 보존 리스크.
- **ON DELETE 정책**: bookings는 RESTRICT(거래 보호, 적정), conversations/messages/favorites/notifications는 profiles CASCADE(적정), inquiries는 SET NULL(리드 모델 의도이나 PII 잔존이 문제).

---

## 검증했으나 이상 없는 항목 (회귀 방지용 기록)
- 갤러리/검색/카테고리/작가프로필 RLS 및 FK 임베드 명시 — 정상.
- getUser 기반 신뢰 결정, role 서버 결정, service-role server-only 격리 — 정상.
- 리드 언락 게이트 함수(`listMyAcceptedInquiries`)의 confirmed 분기 — 정상(단 진입점 누수는 치명1).
- 결제 핵심 경로(markTransferSent/confirmBankTransfer/markShot/confirmCompletion) 멱등·조건부 UPDATE — 정상.
- consultation_briefs RLS(참여자 읽기/고객 쓰기) — 정상.
- 분석 트래킹 페이지 한정(admin/studio 제외, 이중 가드) — 정상.
- 채팅 작가 시점 고객 이름 보강이 display_name만(phone 미노출) — 정상.
