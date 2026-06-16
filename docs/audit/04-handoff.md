# 전수 플로우 감사 — 인수인계 문서 (Handoff)

> **목적**: samae-app 사용자/작가 전 플로우를 코드·DB·RLS·ERD·역할 기준으로 전수 감사한 결과와, 이미 적용된 수정·남은 작업을 다음 담당자에게 넘긴다.
> **작성일**: 2026-06-16 · **대상 브랜치**: `main` (감사 시작 시점 `c7e8256`)
> **이 문서만 읽으면** 무엇이 끝났고 무엇이 남았는지, 다음에 클로드에게 뭐라고 시키면 되는지 전부 파악 가능.

---

## 0. 한눈에 보기

| 구분 | 상태 |
|---|---|
| 사용자(고객) 플로우 감사 | ✅ 완료 — `docs/audit/01-user-flow-audit.md` (치명3·높음8·중간9·낮음7) |
| 작가(photographer) 플로우 감사 | ✅ 완료 — `docs/audit/02-photographer-flow-audit.md` (치명2·높음3·중간7·낮음7) |
| 통합 수정 계획 | ✅ 작성 — `docs/audit/03-remediation-plan.md` |
| **청크 1 (치명 코드)** | ✅ **수정 완료 + 빌드 통과** (이 문서 §2) |
| 청크 2 (높음 코드) | ⬜ 미착수 (§3) |
| 청크 3 (RLS/스키마 SQL) | ⬜ 미착수 (§4) |
| 청크 4 (설계 결정 필요) | ⬜ 사용자 논의 대기 (§5) |
| 인프라/배포 미결 | ⬜ (§6) — 마이그레이션 0035~0039 prod 적용 등 |

> **중요**: 아직 커밋하지 않았습니다. 청크 1 수정분이 워킹트리에 있는 상태입니다(빌드 통과 확인). 커밋/푸시/PR은 담당자/사용자 지시 후 진행하세요.

### 감사 방법론
- 두 개의 백그라운드 서브에이전트가 각각 "사용자" / "작가" 페르소나로 **모든 플로우를 실제 코드 한 줄씩 추적**하며 `supabase/migrations/0001~0039`와 대조.
- 점검 축: 실제 에러 · 잘못된 플로우 · 불필요/누락 기능 · 위험요소(서비스롤 RLS우회·개인정보 조기노출) · 미래 리스크(race·soft-delete 누적·FK 정책) · 관계형 무결성/ERD · 역할(role) 경계.
- 두 에이전트가 **독립적으로 같은 이슈를 짚은 항목은 신뢰도 ★** 표기.

### 핵심 데이터 모델 사실 (수정 전 반드시 인지)
- `role` enum = `user | admin` 뿐(`0001_init.sql:21`). **"작가"는 `profiles.role`이 아니라 `photographers(status='approved')` 행 존재로 판단.** 작가가 돼도 role은 안 바뀜. role write는 운영자 전용 `setUserRole` 한 곳뿐(`admin/users/actions.ts:23`). → 작가는 절대 `is_admin` RLS 권한을 얻지 못함(올바른 설계).
- `settlements` 테이블 + `settlement_status` enum은 `0007_direct_transfer.sql`에서 **DROP**됨 → `platform_fees`(booking 기준)로 대체. 코드 어디서도 `settlements` 테이블 참조 안 함.
- `inquiries` RLS는 **enable만 되고 정책 0개** → anon/auth 클라이언트 접근 전면 차단, 전부 service_role(`createAdminClient`) 경유.
- `availability`(개별 슬롯, `is_booked`) + `bookings.availability_id`는 `0012`에서 **폐기 선언**. 실제 가용시간은 `availability_rules` + `availability_blocks` + 예약 시간 중첩 스캔으로 동작. (그래서 환불 로직의 `availability.is_booked=false`는 죽은 코드.)
- `handle` 컬럼은 `0013_drop_handle.sql`에서 **제거**, 이후 재추가 없음.
- `guard_photographer_status` 트리거(`0002`)가 작가의 자가 status 변경을 차단(운영자/service_role만 가능) → 작가 자가승격 불가.
- booking 상태머신 enum: `requested / accepted / paid / shot / delivered / completed / rejected / cancelled / refunded`.

---

## 1. 발견된 전체 이슈 마스터 목록

> 두 감사 문서의 모든 이슈를 종합·중복제거. **[코드]** = 코드 수정, **[SQL]** = 마이그레이션, **[설계]** = 정책 결정 필요.
> `✅수정완료` 표시 외에는 전부 미착수.

### 치명 (4)
| ID | 이슈 | 위치 | 유형 | 상태 |
|----|------|------|------|------|
| C1 ★ | 문의 제출 즉시 **알림 본문에 고객 연락처 평문 노출** → 리드 언락 모델 우회 + PII 조기노출 | `inquiry/actions.ts:244-257,230-237` | 코드 | ✅수정완료 |
| C2 ★ | **`inquiries` 테이블 RLS 정책 전무**(enable만) — 연락처 보호가 앱 코드 분기 한 줄에만 의존, RLS 백스톱 없음 | `0029_inquiries.sql:41` | SQL | ⬜ |
| C3 ★ | **작가 승인 페이지가 드롭된 `handle` 컬럼 조회 → 페이지 로드 실패 → 작가 온보딩 전면 마비** | `admin/photographers/page.tsx:37,97,121` | 코드 | ✅수정완료 |
| C4 | **reviews RLS가 "본인+완료예약" 미강제** → 거래 없이 후기/별점 위조(평점 테러) 가능 | `0001_init.sql:465-466` | SQL | ⬜ |

### 높음 (10)
| ID | 이슈 | 위치 | 유형 | 상태 |
|----|------|------|------|------|
| H1 ★ | `deliverFinals` 최종 UPDATE에 status 가드 없음(TOCTOU) → 환불↔완료 경쟁 시 `refunded`를 `completed`로 덮어씀 | `actions/payments.ts:151-183` | 코드 | ⬜ |
| H2 | `refundBooking` 상태전이 TOCTOU(선행 상태 가드 없음) | `actions/payments.ts:335-347` | 코드 | ⬜ |
| H3 | `acceptBooking` 슬롯 점유 비원자 → 동시 수락 시 **이중 부킹** | `actions/bookings.ts:243-265` | 코드 | ⬜ |
| H4 | `/api/track` 미인증 공개 POST + service-role insert → 익명 스팸 적재(테이블 폭증·비용·시트 스팸) | `api/track/route.ts:20-87` | 코드 | ⬜ |
| H5a | auth/callback `next` 미검증 **오픈 리다이렉트**(피싱) | `auth/callback/route.ts` | 코드 | ⬜ |
| H5b | auth/confirm `next` 미검증 오픈 리다이렉트 | `auth/confirm/route.ts` | 코드 | ⬜ |
| H6 | 이메일 가입 차단이 **클라이언트 플래그뿐**(`EMAIL_SIGNUP_ENABLED`) — 서버/Supabase 미강제 → 콘솔/직접호출로 가입 가능 | `signup/page.tsx:11` | 코드+설정 | ⬜ |
| H7 ★ | 작가 수취계좌가 **채팅 진입만으로** 서버 응답에 포함(수락 전) | `chat/[id]/page.tsx:41-43` | 코드 | ✅수정완료 |
| H8 | `listReviewsForPhotographer`가 service_role로 RLS 우회 + 권한검증을 **호출자 가드에만 의존**(백스톱 없음) → 타작가 후기+고객 실명 유출 구조 | `lib/reviews.ts:33-47` | 코드 | ⬜ |
| H9 | **정산 공백** — 리드(문의) 입금 모델에서 `platform_fees` 미생성. settlements 페이지/알림은 booking 기반 옛 원장을 가리켜 항상 빈 화면. 작가 매칭 수수료 원장이 코드상 부재 | `studio/settlements/`, `lib/payments.ts:97-107,241` | 설계 | ⬜ |

### 중간 (16)
| ID | 이슈 | 위치 | 유형 |
|----|------|------|------|
| M1 | `favorites.target_id` 폴리모픽 컬럼 FK 없음 → 고아 레코드 누적, 삭제된 대상 찜수 부풀림 | `0001_init.sql:173-180` | SQL/설계 |
| M2 | 로그인 사용자가 문의하면 `profiles.phone`/`instagram_id`를 **무조건 덮어씀** → 타인 대신 입력 시 본인 프로필 오염 | `inquiry/actions.ts:155-165` | 코드 |
| M3 | 채팅 나가기 — 완료/거절 거래 대화를 **일방이 영구 삭제**(상대 화면에서 증빙 소멸) | `chat/actions.ts leaveConversation` | 코드 |
| M4 | unread 카운트 race — markRead(0 리셋)와 수신 메시지 +1 트리거 경쟁 시 안읽음 누락 | `0004_chat.sql:22,28` + `chat/actions.ts` | 코드/SQL |
| M5 | 채팅/브리프 이미지 업로드가 Content-Type만 신뢰(매직바이트 미검증). sharp 재인코딩이 사실상 방어하나 svg 등 엣지 | `api/chat/upload/route.ts:20`, `api/brief/route.ts:103` | 코드 |
| M6 | `deposit_amount_krw` 기본값 6000 하드코딩 → 작가별/카테고리별 차등·일괄변경 불가 | `0035_inquiry_deposit.sql:13` | SQL/설계 |
| M7 | 탈퇴 시 `requested`(미수락) 예약 삭제로 상대(작가) 예약목록에서 거래 통째 사라짐 | `settings/actions.ts:46,60-79` | 코드/설계 |
| M8 | 탈퇴 후 `inquiries`는 `profile_id` SET NULL로 잔존하나 **연락처 PII 컬럼 그대로 남음** → 개인정보 삭제 컴플라이언스 위반 소지 | `0029_inquiries.sql:6` | 코드/설계 |
| M9 | `auth/callback` code 교환 실패 원인 swallow(로깅 없음) + provider 거부 쿼리 미처리 | `auth/callback/route.ts` | 코드 |
| M10 | 작가 승인/반려/정지에 **from-status 가드 없음** → 모든 전이 무제한(`rejected→approved` 등) | `admin/photographers/actions.ts:16-52` | 코드 |
| M11 | 승인 코드만 RLS 의존(`createClient`), 다른 운영자 액션은 service_role → 패턴 비일관 | `admin/photographers/actions.ts:16-26` | 코드 |
| M12 | 작가 승인/반려/정지 시 **작가에게 알림 미발송** | `admin/photographers/actions.ts` | 코드 |
| M13 | `updatePackage`/`togglePackageActive`/`setPhotoVisibility`/`updatePhotoMeta`/`updateFeedMeta`/`removeBlock`가 **`photographer_id` 필터 없이 RLS 단독 의존**(같은 파일 delete는 명시검증 — 비대칭). 현재 RLS 정책 실재해 안전하나 방어심층화 결여 | `studio/packages/actions.ts:56-87`, `studio/portfolio/actions.ts:30-107`, `studio/availability/actions.ts:65` | 코드 |
| M14 | `updateBooking` TOCTOU 계열 — 비원자 read 후 update에 status `.eq` 없음 → accept와 경쟁 시 accepted 예약에 편집 적용 | `actions/bookings.ts:152-192` | 코드 |
| M15 | `proposeBooking` 중복 활성 제안 방지 없음 + 매 제안마다 `conversations.booking_id` 덮어써 이전 카드 고아화 | `actions/bookings.ts:104-125` | 코드 |
| M16 | `confirmInquiryDeposit` silent no-op — 0행 매칭 시 에러 없이 성공처럼 반환(운영자 오인) | `admin/inquiries/actions.ts:45-76` | 코드 |
| M17 | 스튜디오 기능 페이지 가드가 `me.photographer` 존재만 확인(status 무관) → **미승인 작가도 직접 URL로 프로필/패키지/포트폴리오 작성·수정 가능** | `studio/*/page.tsx`, `studio/layout.tsx:7-11` | 코드 |
| M18 | `studio/chat` 라우트 완전 비활성(layout이 무조건 redirect) → `listChatRooms`/`fillCustomerNames` 등 **dead code** 유지보수 부채 | `studio/chat/layout.tsx`, `page.tsx` | 코드 |
| M19 | settlements 라우트가 사이드바에선 숨겨졌으나 **직접 URL 접근 가능**(빈 데이터). H9와 함께 정리 | `studio/StudioSidebar.tsx:22-25` | 코드 |

> (M 항목이 16을 넘는 것은 두 문서 중간 항목을 합쳤기 때문 — 번호는 식별용.)

### 낮음 (정리·개선 권고)
| ID | 이슈 | 위치 |
|----|------|------|
| L1 | `getCurrentUser`가 `.single()` — profiles 누락 시 silent 에러(폴백은 권한축소라 안전) | `lib/auth.ts:26-30` |
| L2 | 로그인 후 `next` 미반영(deep-link 복귀 불가) — UX | `login/page.tsx` |
| L3 | 검색/추천이 "최근 N건 받아 JS 필터·셔플" — 데이터 200건↑시 누락(베타 한정 명시) | `discovery.ts:99-116,325-365` |
| L4 | Realtime bookings 구독 row 필터 없음 — RLS 의존(현행 누출 아님, 회귀테스트 권장) | `ChatRoom.tsx`, `0017` |
| L5 | `acceptInquiry`에 `status==='approved'` 가드 없음(정상 UI론 도달 불가, 직접호출 방어 부재) | `studio/actions.ts:212-213` |
| L6 | `revertInquiryDeposit` 재잠금 시 작가 알림 누락(비대칭) | `admin/inquiries/actions.ts:79-90` |
| L7 | 운영자 리셋 비밀번호 평문 하드코딩(`same123!`) | `admin/inquiries/actions.ts:9` 외 |
| L8 | `sendPortfolioPhoto`가 `image_path`에 URL 저장(컬럼 의미 불일치) | `chat/actions.ts:65-71` |
| L9 | 업로드 시 `photos.region` 항상 null → `idx_photos_visibility(visibility,region)` region 미활용 | `api/portfolio/upload/route.ts:107-120` |
| L10 | `reorderPhoto`/`reorderHighlight` 비원자 다중행 재정렬(부분 실패 시 sort_order 불일치) | `portfolio/actions.ts:164-166`, `highlights/actions.ts:146-148` |
| L11 | `proposeBooking` 패키지 소유자 검증 부재 → 타작가 패키지 id로 예약 생성(폼 위조) | `actions/bookings.ts:82-93` |
| L12 | `acceptBooking` 충돌 스캔 duration null 시 60분 fallback(과소/과대 블록) | `actions/bookings.ts:239,254` |
| L13 | `updateBooking` 수정권한 비대칭(구매자만) — 보안 아님, UX | `actions/bookings.ts:157` |
| L14 | 신청 시 작가명 중복검사 race(`display_name` DB unique 없음) | `studio/actions.ts:82-94` |
| L15 | `profile/page.tsx`·기타 `.single()` — 행 없으면 throw | `studio/profile/page.tsx:29` |
| L16 | `deliveries.asset_paths` last-write-wins(동시 업로드 경로 유실, 작가 1인이라 실위험 낮음) | `api/delivery/upload/route.ts:64-73` |
| L17 | `/api/track`가 `getSession()` 사용(다른 경로는 getUser) — 귀속용이라 영향 낮으나 비일관 | `api/track/route.ts:53` |

### 부록: 관계형 무결성 / ERD 관점 종합
- **폴리모픽 favorites**(M1): FK·cascade 부재 → 고아 누적. `favorite_photographers`/`favorite_photos` 분리 또는 삭제 트리거 권장.
- **inquiries PII 평문 + RLS 정책 부재**(C2): 연락처(phone/instagram/discord/contact_email/extra_contact)가 한 테이블에 평문. 컬럼 분리 또는 뷰 게이팅 검토.
- **notifications PII 잔존**(C1 근본): 알림 본문에 PII 저장 금지 원칙. notifications 삭제/보존 정책 부재 → 무한 누적.
- **availability_id 미사용**: 항상 null인데 환불 로직이 참조(H3 관련). 슬롯 모델 일관화 필요.
- **deleted_records 누적**(`0039`): 소프트딜리트가 모두 한 테이블에 jsonb 적재. 보존기간/파기 정책 없으면 무한 증가 + PII 장기보존 리스크.
- **ON DELETE 정책**: bookings RESTRICT(거래보호·적정), conversations/messages/favorites/notifications는 profiles CASCADE(적정), inquiries SET NULL(리드 모델 의도이나 PII 잔존이 문제 — M8).

---

## 2. ✅ 청크 1 — 이미 적용 완료된 수정 (빌드 통과)

> 워킹트리에 반영됨, 아직 커밋 안 함. `npm run build` exit 0 확인.

### C1 — 문의 알림 본문 연락처 제거 + 닉네임 fallback 차단 + 성공메시지 수정
**파일**: `src/app/(user)/inquiry/actions.ts`

1. `submitInquiry` 성공 메시지:
   - 변경 전: `"작가에게 연락처가 전송되었습니다. 곧 연락을 할 예정입니다."`
   - 변경 후: `"문의가 작가에게 전달되었어요. 작가가 확인 후 연락드릴 예정입니다."`
2. `inquiryNickname(displayName, contact)` → `inquiryNickname(displayName)`:
   - `displayName || contact.instagramId || contact.extraContact || "비회원"` → `displayName || "비회원"` (연락처를 닉네임 fallback으로도 쓰지 않음)
3. `buildInquiryBody`:
   - `전화번호:`/`인스타:`/`기타 연락처:` **3개 라인 전부 제거**
   - 끝에 `"수락 후 입금이 확인되면 연락처가 공개됩니다."` 안내 라인 추가
   - 본문은 이제 [닉네임] + 목적/희망일정/희망지역/레퍼런스 장수 + 안내문구만
   - `contact` 파라미터는 미사용이 되어 `_contact`로 표기(시그니처 유지)

> **효과**: 작가는 `acceptInquiry`(수락) → 고객 입금 → 운영자 `confirmInquiryDeposit`(status=`confirmed`) 이후에만 `listMyAcceptedInquiries` 경로로 연락처를 본다. 알림 우회 경로 차단 → 리드 언락(건당 6,000원) 모델 실제 강제.
> **남은 연관**: 알림에 과거 저장된 PII는 그대로 남음(신규만 안전). notifications PII 정리(C1 근본/낮음)는 별도. inquiries 테이블 자체 보호는 C2(SQL) 필요.

### C3 — 작가 승인 페이지에서 드롭된 `handle` 컬럼 제거
**파일**: `src/app/(admin)/admin/photographers/page.tsx`

- `Row` 타입에서 `handle: string;` 제거
- select 문자열에서 `handle, ` 제거 → `"id, display_name, bio, regions, mood_tags, price_from_krw, review_count, status, created_at"`
- 전체작가 목록 행: `@{r.handle} · 후기 {r.review_count}` → `후기 {r.review_count}`
- `ApplicantHeader`: `@{row.handle} · 신청 ...` → `신청 ...`

> **효과**: PostgREST `column does not exist` 에러 해소 → 승인 페이지 정상 로드 → 작가 승인/반려/정지 UI 복구(온보딩 정상화).

### H7 — 작가 수취 계좌를 booking 기반 서버액션으로 지연 로딩
**파일**: `src/app/(user)/chat/actions.ts`, `src/app/(user)/chat/[conversationId]/page.tsx`, `src/app/(user)/chat/[conversationId]/ChatRoom.tsx`

1. `chat/actions.ts`에 서버액션 신설:
   ```ts
   const PAYOUT_VISIBLE_STATUSES = ["accepted","paid","shot","delivered","completed"];
   export async function getBookingPayoutAccount(bookingId): Promise<PayoutAccount|null> {
     // 로그인 + bookings 조회(user_id===me.id, 즉 고객 본인) + status가 위 목록일 때만
     // getPhotographerPayoutAccount(photographer_id) 반환, 아니면 null
   }
   ```
   (`getPhotographerPayoutAccount`, `PayoutAccount` 를 `@/lib/payments`에서 import 추가)
2. `page.tsx`: 채팅 진입 시 무조건 하던 `getPhotographerPayoutAccount(...)` 사전 fetch **제거**, `payoutAccount` prop 제거, 관련 import 제거.
3. `ChatRoom.tsx`: `payoutAccount` prop을 `ChatRoom`/`BookingCard`/`TransferSection` 체인에서 전부 제거. `TransferSection` 내부에서 `useEffect`로 `getBookingPayoutAccount(booking.id)` 호출해 state에 저장(고객일 때만). 로딩 중에는 "계좌 정보를 불러오는 중…" 스피너 표시(기존엔 null이면 곧장 "계좌 미등록" 경고가 떴음).

> **효과**: 채팅방 진입만으로 계좌가 응답에 실리는 문제 제거. **부수 효과**: 수락(accepted) 직후 `router.refresh` 없이도 계좌가 즉시 표시되어 기존 잠재 UX 버그(수락 직후 계좌 안 보임)도 해소.

---

## 3. ⬜ 청크 2 — 높음 (코드만으로 수정 가능). 다음 담당자가 바로 진행할 작업

> **다음 담당자/클로드에게 줄 지시 예시**: "docs/audit/04-handoff.md §3의 청크 2를 순서대로 수정하고 각 항목마다 `npm run build`로 검증해줘. 커밋은 내가 지시할 때까지 하지 마."

- **H1 `deliverFinals` TOCTOU** (`actions/payments.ts:151-183`): 최종 `update({status:"completed",...}).eq("id",id)`에 선행 상태 가드 추가 → `.eq("id",id).in("status",["paid","shot"])`. 0행이면 에러 throw. (markShot/confirmBankTransfer가 이미 쓰는 조건부 UPDATE 패턴과 동일하게.)
- **H2 `refundBooking` TOCTOU** (`payments.ts:335-347`): `update({status:"refunded"}).eq("id",id)`에 `.in("status",["paid","shot","delivered"])` 추가, 0행이면 중단.
- **H3 `acceptBooking` 이중부킹** (`bookings.ts:243-265`): 시간중첩을 select 비교로만 하지 말고, 수락 시 원자적 가드 추가. 옵션: (a) bookings에 시간겹침 EXCLUSION 제약(SQL 동반), (b) 최소한 `requested→accepted` 전이를 조건부 UPDATE(`.eq("status","requested")`)로 하고 수락 직후 재검사. 죽은 `availability_id` 경로는 정리.
- **H4 `/api/track` 가드** (`api/track/route.ts`): Origin/Referer 화이트리스트 검증 추가, 세션/IP 단위 간단 레이트리밋(예: 메모리 토큰버킷 또는 KV), payload 상한 유지. 미인증이어도 같은 출처에서만 적재되도록.
- **H5a/H5b 오픈 리다이렉트** (`auth/callback/route.ts`, `auth/confirm/route.ts`): `next`가 `/`로 시작 + `//`·`/\`·스킴 미포함인 내부 경로일 때만 허용, 아니면 `/`로 폴백. (공통 헬퍼 `safeNext(next)` 하나 만들어 양쪽에서 사용 권장.)
- **H8 `lib/reviews` 권한 누수** (`lib/reviews.ts:33-47`): service_role 우회 + 호출자 가드 의존 구조 → 호출 지점에서 photographerId 소유/공개 검증을 강제하거나, 공개 후기 조회는 RLS 통과하는 user 클라이언트로 전환. 고객 실명이 섞여 나가지 않게 select 컬럼 최소화.
- **(덤) L11 `proposeBooking` 패키지 소유검증** (`bookings.ts:82-93`): 패키지 조회에 `.eq("photographer_id", conv.photographer_id)` 추가.
- **(여력 시) M14 `updateBooking` TOCTOU**: update에 `.eq("status","requested")` 추가.

> 청크 2는 서로 독립적이라 순서 무관. 각 수정 후 빌드 통과 확인. H3은 SQL 제약을 곁들이면 청크 3과 겹칠 수 있음.

---

## 4. ⬜ 청크 3 — RLS / 스키마 (SQL 마이그레이션). `0040_*.sql`로 묶어 제공

> 운영 DB(prod)는 사용자가 Supabase SQL Editor에 직접 붙여넣어 적용하는 방식. 마이그레이션 파일 작성 + 합본 SQL을 클립보드로 제공하는 패턴.

- **C2 `inquiries` RLS 정책** (`0029` 후속): inquiries에 SELECT 정책 추가 — 작가는 `is_my_photographer(photographer_id)`, 운영자는 `is_admin()`. 단 **연락처는 `status='confirmed'` 이전에는 노출 금지**가 핵심이므로, RLS만으로 컬럼 게이팅이 어려우면 (a) 연락처 컬럼을 별도 테이블/뷰로 분리하거나 (b) 현행처럼 service_role 전용을 유지하되 "정책 부재=암묵적 거부"를 **명시적 deny 정책 + 주석**으로 고정. INSERT는 service_role 전용 유지. 최소한 모든 service_role 쿼리에 `photographer_id`/`status` 필터가 강제되는지 회귀 확인.
- **C4 reviews RLS 강화** (`0001:465-466`): INSERT `with check`에 "본인(`user_id=auth.uid()`) + 해당 booking이 `completed` + 그 booking의 구매자=본인" 조건 추가. 거래 없는 후기/별점 위조 차단. (rating 집계 트리거와의 정합 확인.)
- **M1 favorites 무결성**(선택): `favorite_photographers`/`favorite_photos` 분리(FK + ON DELETE CASCADE) 또는 사진/작가 삭제 트리거로 고아 favorites 정리.
- **(연계) H3** bookings 시간겹침 EXCLUSION 제약을 여기서 함께 정의할 수 있음.

> **작성 후**: 마이그레이션 파일(`supabase/migrations/0040_*.sql`) 생성 → 합본 SQL을 사용자에게 클립보드로 전달 → 사용자가 prod 적용. 적용 전엔 RLS 변경이 운영에 영향 줄 수 있으니 staging/로컬에서 먼저 검증 권장.

---

## 5. ⬜ 청크 4 — 설계 결정 필요 (사용자/팀 논의 후 진행)

코드만으로 정할 수 없는 정책 결정. **먼저 결정을 받고** 구현.

- **H9 정산 공백** (가장 중요): 현재 수익원인 리드(문의) 입금에서 `platform_fees`가 안 생김. 선택지:
  - (a) `confirmInquiryDeposit`(운영자 입금확인) 시 inquiry 기준 수수료 원장 생성 경로 신설(inquiry→fee 테이블/뷰),
  - (b) settlements 페이지·알림을 inquiry 입금 기준으로 재설계,
  - (c) 당분간 미사용이면 settlements 라우트/알림 제거(M19/M18과 함께).
- **M7/M8/M3 탈퇴·삭제 정책**: 작가 탈퇴 시 상대 고객 예약·후기까지 삭제되는 문제(RESTRICT FK 연쇄). 상대 거래는 `cancelled` 전이 후 보존 또는 photographer 참조 `set null`로 재설계할지. 탈퇴 시 inquiries 연락처 PII 마스킹/삭제 여부(개인정보 컴플라이언스). 채팅 나가기 시 완료거래 대화는 per-side 숨김으로 일원화할지.
- **deleted_records 보존정책**: 소프트딜리트 누적 테이블의 보존기간·파기 주기·PII 처리 정책.
- **M6 `deposit_amount_krw`**: 작가/카테고리별 차등 또는 운영자 일괄변경 경로 필요 여부.
- **M17 미승인 작가 권한 경계**: 스튜디오 기능 페이지를 `status='approved'`로 게이트할지(현재 미승인도 작성 가능, 단 공개 노출은 안 됨).

---

## 6. ⬜ 인프라 / 배포 미결사항 (감사 이전부터 누적)

- **마이그레이션 `0035`~`0039` prod 적용**: 인증·어드민·리드입금·카테고리·분석·소프트딜리트 PR(#2~7)이 main 머지됨. prod DB에 0035~0039가 적용 안 되면 신규 컬럼/테이블 참조로 런타임 에러. (특히 `0039_deleted_records` 없으면 모든 소프트딜리트가 에러.) 합본 SQL은 이전 세션에서 클립보드로 전달했으나 적용 여부 확인 필요.
- **`SHEETS_WEBHOOK_URL`** Vercel(prod) env 등록 — 행동분석 구글시트 전송용(로컬 `.env.local`엔 존재).
- **이메일 가입(H6)**: 도메인/커스텀 SMTP(Resend 등) 준비 전까지 Supabase 대시보드에서 이메일 회원가입 비활성화로 서버단 강제(클라 플래그만으로는 불충분).
- main 머지가 prod 자동배포를 트리거할 수 있으니, 위 마이그레이션 적용과 배포 순서 주의.

---

## 7. 참고 문서
- `docs/audit/00-audit-overview.md` — 인덱스
- `docs/audit/01-user-flow-audit.md` — 사용자 플로우 상세(파일:라인 근거 + 제안수정)
- `docs/audit/02-photographer-flow-audit.md` — 작가 플로우 상세(상태머신 표 포함)
- `docs/audit/03-remediation-plan.md` — 청크 분할 계획
- 프로젝트 컨텍스트: `docs/01-product-overview.md`, `docs/03-architecture.md`, `docs/04-database-schema.md`, `docs/05-booking-lifecycle.md`, `docs/06-payment-settlement.md`

## 8. 다음 담당자를 위한 권장 진행 순서
1. (배포 안전) §6 마이그레이션 0035~0039 prod 적용 상태부터 확인.
2. §3 청크 2(높음 코드) 수정 — 항목별 빌드 검증.
3. §4 청크 3(RLS/스키마 SQL) 작성 → staging 검증 → 합본 SQL prod 적용.
4. §5 청크 4(설계) 결정 받고 구현 — 특히 H9 정산.
5. 중간/낮음 항목은 위 표 기준으로 우선순위 매겨 정리.
6. 전 과정 커밋은 feature 브랜치 + PR(메인 직접 push 금지), 커밋 메시지는 단계/청크 단위 한국어 Conventional Commits.
