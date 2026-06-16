# 작가(Photographer) 페르소나 플로우 전수 감사

> 범위: 작가 관점의 모든 플로우(신청·승인·스튜디오·포트폴리오·하이라이트·문의/입금·채팅·예약·정산·배송·탈퇴)를 코드와 스키마(`supabase/migrations/0001~0039`)를 대조하며 한 줄씩 추적.
> 방식: 추측 금지, 모든 근거는 `파일:라인`. 소스 무수정(read-only).
> 작성일 기준 마이그레이션: 0001~0039.

---

## 요약 (심각도별 카운트 + 치명/높음 목록)

| 심각도 | 개수 |
|---|---|
| 치명 | 2 |
| 높음 | 3 |
| 중간 | 7 |
| 낮음 | 7 |

### 치명 (2)
1. **[치명] 운영자 작가 승인 페이지가 드롭된 `handle` 컬럼을 조회 → 페이지 전체 로드 실패 (작가 승인 플로우 마비)** — `src/app/(admin)/admin/photographers/page.tsx:37,97,121`
2. **[치명] `inquiries` 테이블 RLS 활성화 + 정책 0개 → 작가 측 문의 조회/수락이 전적으로 service_role에만 의존(앱 레이어 가드가 유일한 방어선)** — `0029_inquiries.sql:41` (정책 부재) + `src/lib/inquiries.ts`, `src/app/(photographer)/studio/actions.ts:216`

### 높음 (3)
3. **[높음] `deliverFinals` 최종 UPDATE에 status 가드 없음 → 환불/완료 레이스(TOCTOU)로 `refunded`를 `completed`로 덮어쓸 수 있음** — `src/app/actions/payments.ts:151-183`
4. **[높음] `listReviewsForPhotographer`가 service_role로 RLS를 우회하며 권한 검증을 호출자 가드에만 의존(RLS 백스톱 없음)** — `src/lib/reviews.ts:33-47`
5. **[높음] 리드(문의) 모델에서 `settlements`(수수료) 페이지는 항상 비어 보이는 유물 라우트 + 알림이 여전히 그곳을 가리킴** — `src/app/(photographer)/studio/settlements/page.tsx`, `src/lib/payments.ts:97-107,241`

---

## 0. 사전 확인된 데이터 모델 사실 (감사 판단 근거)

- **role enum = `user|admin` 뿐**(`0001_init.sql:21`). "작가 여부"는 `photographers(approved)` 행 존재로 판단(`0001:10`). **작가가 되어도 `profiles.role`은 절대 바뀌지 않음** — `profiles.role` write는 운영자 전용 `setUserRole` 단 한 곳뿐(`src/app/(admin)/admin/users/actions.ts:23`). 신청/승인 어디서도 role 미변경. → 작가는 결코 `is_admin` RLS 권한을 얻지 못함(올바른 설계).
- **`settlements` 테이블 + `settlement_status` enum은 `0007_direct_transfer.sql:77-78`에서 DROP**, `platform_fees`(booking 기준)로 대체(`0007:48-64`). 작가 코드 어디서도 `settlements` 테이블 자체를 참조하지 않음(올바름).
- **`inquiries` RLS는 enable만 되고 정책이 0개**(`0029_inquiries.sql:41`; 전 마이그레이션에 `create policy ... on public.inquiries` 없음). → anon/auth 클라이언트로는 inquiries에 일절 접근 불가, 전부 service_role 경유.
- **`availability`(개별 슬롯, `is_booked`) 테이블 + `bookings.availability_id`는 `0012`에서 폐기 선언**("더 이상 사용 안 함", `0012_availability_rules.sql:14`). 실제 가용시간은 `availability_rules` + `availability_blocks` + 예약 시간 중첩 스캔으로 동작.
- **`handle` 컬럼은 `0013_drop_handle.sql`에서 제거**, 이후 어떤 마이그레이션에서도 재추가 없음(`0001:119`가 유일 정의).
- **status guard 트리거**: 작가가 스스로 `status`를 못 바꾸도록 `guard_photographer_status`(`0002`)가 BEFORE UPDATE로 막음(운영자/service_role만 status 변경). → 작가 자가승격 불가(올바름).

---

## 1. 작가 신청 → 운영자 승인

### [치명] 운영자 작가 승인 페이지가 드롭된 `handle` 컬럼 조회 → 페이지 로드 실패
- 위치: `src/app/(admin)/admin/photographers/page.tsx:37` (`.select("id, handle, display_name, ...")`), `:10`(타입), `:97`(`@{r.handle}`), `:121`(`@{row.handle}`)
- 플로우/현상: 운영자가 `/admin/photographers`에 진입 → `photographers`에서 `handle`을 select. `handle`은 `0013_drop_handle.sql`에서 DROP되어 DB에 존재하지 않음.
- 원인: 0013 마이그레이션(핸들 제거, id 기반 식별 전환) 이후 운영자 페이지 쿼리가 갱신되지 않음. PostgREST가 `column photographers.handle does not exist`(코드 42703 / PGRST204류)를 반환 → 페이지가 빈 목록 또는 에러로 깨짐.
- 영향: **작가 승인/반려/정지의 유일한 UI 진입점이 동작 불능 → 신규 작가가 영원히 `pending`에 묶임. 작가 온보딩 전체가 막힘.** (승인 액션 자체는 `id`로만 동작하므로 멀쩡하지만, 그 액션을 호출할 페이지가 안 떠서 무의미.)
- 제안 수정: `page.tsx:37` select에서 `handle` 제거, `:10` 타입·`:97`·`:121`의 `@{...handle}` 렌더 제거(또는 `display_name`/`id`로 대체).

### [중간] 승인/반려/정지에 from-status 가드 없음
- 위치: `src/app/(admin)/admin/photographers/actions.ts:16-52`
- 플로우/현상: `approvePhotographer`/`rejectPhotographer`/`suspendPhotographer` 모두 `.update({status}).eq("id", id)`만 — 출발 상태 조건 없음.
- 원인: 상태머신 가드 누락. inquiries actions가 `.eq("status","accepted")`로 가드하는 것과 비일관.
- 영향: `rejected → approved`, `suspended → approved` 등 모든 전이 무제한. 동시 클릭/오작동 시 의도치 않은 전이 가능(보안보다는 운영 일관성 문제).
- 제안 수정: 전이별 from-status를 `.eq("status", ...)`로 제한(예: approve는 `pending|suspended|rejected`만, suspend는 `approved`만).

### [중간] 승인 코드가 service_role 권고를 무시하고 RLS에 의존(주석/문서 불일치)
- 위치: `src/app/(admin)/admin/photographers/actions.ts:16-26` (`createClient()` 사용)
- 플로우/현상: `approvePhotographer`가 유저 스코프 `createClient()`로 `photographers` update. `admin.ts` 주석은 "돈·상태 전이는 service_role 전용"을 권고하나 여기선 미적용.
- 원인: 구현이 `assertAdmin()`(role 가드) + `photographers_update` RLS(`profile_id=auth.uid() or is_admin()`)에만 의존. `guard_photographer_status` 트리거가 `is_admin()` 통과를 허용하므로 운영자면 동작은 함.
- 영향: 기능적으론 동작(운영자 role 보유 시). 단 inquiries/users는 service_role을 쓰는데 여기만 RLS 의존 → 패턴 비일관. RLS/role 설정이 어긋나면 조용히 실패.
- 제안 수정: 일관성 위해 service_role 경로로 통일하거나, 비일관을 문서화.

### [중간] 승인 후 작가에게 알림 없음
- 위치: `src/app/(admin)/admin/photographers/actions.ts:16-26`(approve), 반려/정지 동일
- 현상: 승인/반려/정지 시 `notifications` insert 없음. 작가는 자기 신청이 승인됐는지 별도 통지를 못 받음(스튜디오 재방문 시 상태 카드로만 인지).
- 영향: UX 공백. 승인된 작가가 즉시 인지 못 함.
- 제안 수정: approve/reject 시 `notifications.insert({recipient_id: <작가 profile_id>, type:"system", ...})`.

### [낮음] 신청 시 작가명 중복검사 race
- 위치: `src/app/(photographer)/studio/actions.ts:82-94`
- 현상: `isDisplayNameTaken`(read) → insert 사이에 race 가능. 단 `profile_id` unique(23505)는 보완되나 `display_name`은 DB unique 제약이 없어(0013에서 handle만 unique였고 display_name은 not null만) 동명 작가가 동시 신청 시 둘 다 통과 가능.
- 영향: 드물게 작가명 중복 허용.
- 제안 수정: `photographers.display_name`에 unique 인덱스(또는 `lower(display_name)` unique) 추가 검토.

**[이상 없음]** 신청 자가승격 방지(`guard_photographer_status` 트리거, `0002`)·중복 신청 가드(`actions.ts:58-63` + 23505 보완)·apply 페이지 가드(이미 작가면 `/studio` redirect)는 정상.

---

## 2. 스튜디오 프로필 편집 + 패키지 CRUD

### [중간] `updatePackage`·`togglePackageActive`에 코드 레벨 소유권 가드 없음(RLS 단독 의존)
- 위치: `src/app/(photographer)/studio/packages/actions.ts:56-87`
- 플로우/현상: 두 함수 모두 `requirePhotographerId()`(작가 여부만 확인) 후 `.update(...).eq("id", id)` — `photographer_id` 필터 없음. 반면 `deletePackage:90-105`는 명시적으로 `pkg.photographer_id !== me.photographer.id` 검증.
- 원인: 같은 파일 내 비대칭. 안전성을 `packages_write` RLS(`is_my_photographer(photographer_id)`, `0001:410`)에 전적으로 의존.
- 영향: RLS가 살아있는 한 IDOR 불가(검증됨 — 정책 존재). 그러나 RLS가 약화/오설정되면 타 작가 패키지 수정 가능. 방어 심층화 결여.
- 제안 수정: update/toggle에도 `.eq("photographer_id", me.photographer.id)` 추가(또는 delete처럼 선조회 검증).

### [낮음] `profile/page.tsx`의 `.single()`
- 위치: `src/app/(photographer)/studio/profile/page.tsx:29`
- 현상: `photographers...single()` — 행 없으면 throw. `me.photographer` 보장 시 안전하나 데이터 이상 시 페이지 크래시.
- 제안 수정: `maybeSingle()` + null 가드.

**[이상 없음]** 프로필 update(`actions.ts:168-177`)는 status 미변경(가드 트리거 보호), `payout_accounts` upsert/delete(`:183-201`)는 `photographer_id=me`로 소유 한정. `packages_select`/`packages_write` RLS(`0001:408-412`) 정상.

---

## 3. 포트폴리오 업로드 + 가능시간

### [중간] `setPhotoVisibility`/`updatePhotoMeta`/`updateFeedMeta`/`removeBlock`가 RLS 단독 의존
- 위치: `src/app/(photographer)/studio/portfolio/actions.ts:30-33,65-68,104-107`; `src/app/(photographer)/studio/availability/actions.ts:65`
- 현상: `.update/delete(...).eq("id", id)`만, `photographer_id` 필터 없음. 일부(`setPhotoVisibility` 등)는 `getCurrentUser` role 체크조차 없음. 반면 `setAlbumVisibility:125-129`는 `.eq("photographer_id", me.photographer.id)` 명시.
- 원인: 소유권을 `photos_write`(`0001:417`)·`avail_blocks_write`(`0012:46`) RLS에만 의존(둘 다 `is_my_photographer(photographer_id)` — **검증됨, 정책 존재**).
- 영향: RLS 살아있으면 안전(IDOR 불가). RLS 약화 시 타인 사진/차단 수정 가능. 방어 심층화 결여 + 코드 일관성 결여.
- 제안 수정: 모든 단건 update/delete에 `photographer_id` 필터 추가.

### [중간] `reorderPhoto`/`reorderHighlight` 비원자적 다중행 재정렬
- 위치: `src/app/(photographer)/studio/portfolio/actions.ts:164-166`; `src/app/(photographer)/studio/highlights/actions.ts:146-148`
- 현상: `Promise.all`로 행별 `sort_order` 개별 update. 동시 재정렬/부분 실패 시 `sort_order` 불일치.
- 영향: 정렬 깨짐(데이터 무결성 경미). 동시성 낮아 실위험 낮음.
- 제안 수정: 단일 트랜잭션/RPC 또는 `upsert` 일괄 처리.

### [낮음] 업로드 시 `region` 항상 null
- 위치: `src/app/api/portfolio/upload/route.ts:107-120` (`region: null` 고정 insert)
- 현상: `photos.region`이 항상 null로 들어감(앨범의 location_text만 사용). `idx_photos_visibility (visibility, region)` 인덱스의 region 부분이 활용 안 됨.
- 영향: region 기반 탐색/필터가 photos.region 기준이면 비게 됨(다른 경로로 location_text 쓰는지 확인 필요).
- 제안 수정: 의도라면 인덱스/문서 정리, 아니면 region 채우기.

**[이상 없음]** 포트폴리오 삭제/교체(`deletePost`/`deletePhoto`/replace route)는 admin 조회 후 `photographer_id` 명시 소유권 재검증. 하이라이트 CRUD는 전 경로 service_role + `ownsHighlight` 소유권 검증(`highlights/actions.ts:21-28,102,120`) + 외부 photo_id 필터링(`:42-46`). availability_rules/blocks RLS write 정책 존재(`0012:28,46`).

---

## 4. 하이라이트 (0026/0027 RLS recursion)

**[이상 없음]** `0026`의 상호 순환 RLS(`highlights_select`↔`highlight_items_select`)를 `0027`이 `highlights_select`에서 `highlight_items` 참조 제거 + 승인 작가 공개 읽기 허용으로 해소(검증됨). 하이라이트 작성/수정/삭제/재정렬 전부 service_role + `ownsHighlight` 가드. 커버 업로드 route는 storage만. 항목 추가 시 `photos.photographer_id` 필터로 타인 사진 끼워넣기 차단(`highlights/actions.ts:42-46`).

(주의: 4-3 reorderHighlight 비원자성은 위 §3에 기재.)

---

## 5. 문의 수신 → 수락 → 입금대기 → 운영자 입금확인 → 연락처 열람

### [치명] `inquiries` RLS 활성·정책 부재 → 전 플로우가 service_role + 앱 레이어 가드에만 의존
- 위치: `0029_inquiries.sql:41`(enable, 정책 없음); `src/lib/inquiries.ts:43-51,75-84`(admin read); `src/app/(photographer)/studio/actions.ts:216-222`(admin write); `src/app/(admin)/admin/inquiries/page.tsx:60-67`(admin read)
- 플로우/현상: `inquiries`는 RLS가 켜져 있으나 SELECT/INSERT/UPDATE 정책이 하나도 없음 → anon/authenticated로는 어떤 접근도 불가(기본 거부). 따라서 작가의 문의 조회(`listMyNewInquiries`/`listMyAcceptedInquiries`)와 수락(`acceptInquiry`), 운영자 조회/입금확인 모두 `createAdminClient()`(service_role)로 RLS를 우회.
- 원인: 정책 미작성(의도일 수 있으나 명시 부재). RLS가 행 접근을 게이트하지 않으므로 **연락처(phone/instagram/discord/email) 노출의 유일한 방어선이 앱 코드의 분기 로직**(`inquiries.ts:93-97` confirmed 전 null 마스킹, `inquiries/page.tsx:86-111` 연락처 잠금)임.
- 영향: 코드 한 줄만 어긋나도(필터 누락, confirmed 판정 오류) **다른 작가의 문의/고객 연락처가 그대로 유출**. RLS 백스톱이 전무. 또한 service_role 쿼리에서 `photographer_id` 필터를 빼면 전 작가 문의가 노출됨(현재는 `.eq("photographer_id", me.photographer.id)`로 한정되어 있어 안전하나 구조적 취약).
- 제안 수정: `inquiries`에 SELECT 정책 추가 — 작가는 `is_my_photographer(photographer_id)`, 운영자는 `is_admin()`, 그리고 연락처 컬럼은 컬럼레벨 보호가 어려우니 뷰 또는 `confirmed` 조건을 RLS USING에 반영. 최소한 service_role 의존을 문서화하고 모든 쿼리에 `photographer_id`/`status` 필터 강제.

### [낮음] `acceptInquiry`에 `status === "approved"` 가드 없음
- 위치: `src/app/(photographer)/studio/actions.ts:212-213`
- 현상: `me?.photographer` 존재만 확인(`pending/rejected/suspended` 작가도 `photographer.id` 보유). status 검사 없음.
- 원인: `me.photographer`는 status 무관하게 채워짐(`auth.ts:44-50`).
- 영향: 정상 UI 경로(미승인이면 `studio/page.tsx`가 `StudioInquiries` 미렌더)로는 도달 불가. 단 서버액션 직접 호출 방어 부재. 미승인 작가는 탐색 노출이 안 돼 문의 자체가 거의 안 생기므로 실위험 낮음.
- 제안 수정: `if (me.photographer.status !== "approved") throw ...` 추가.

### [중간] `confirmInquiryDeposit` silent no-op (운영자 입금확인 실패 피드백 없음)
- 위치: `src/app/(admin)/admin/inquiries/actions.ts:45-76`
- 현상: `.eq("id", id).eq("status","accepted")`로 update. 이미 confirmed거나 다른 상태면 0행 매칭 → `error` 없고 `data=null` → 알림도 안 보내고 성공처럼 반환.
- 영향: race/중복 클릭 시 운영자가 "확인됨"으로 오인. UI 가드(`stage==="await"`만 버튼 노출)로 완화되나 표면화 안 됨.
- 제안 수정: 0행이면 명시 에러 반환/로깅.

### [낮음] `revertInquiryDeposit` 알림 누락(비대칭)
- 위치: `src/app/(admin)/admin/inquiries/actions.ts:79-90`
- 현상: confirm은 작가에게 "연락처 공개" 알림을 보내나(`:64-74`), revert(재잠금)는 알림 없음. 작가는 연락처가 다시 잠긴 줄 모름.
- 제안 수정: revert 시에도 작가 통지.

### [낮음] 운영자 리셋 비밀번호 평문 하드코딩
- 위치: `src/app/(admin)/admin/inquiries/actions.ts:9` (`RESET_PASSWORD = "same123!"`)
- 현상: `clearInquiries`의 확인 비밀번호가 소스에 평문. 운영자 전용 액션이나 소스 노출 시 위험.
- 제안 수정: 환경변수로 이동 또는 제거.

**[이상 없음]** 입금 확인 전 연락처 마스킹은 서버(`inquiries.ts:93-97`)와 운영자 페이지(`page.tsx:86-111`) 양쪽에서 차단. `acceptInquiry`는 `.eq("id").eq("photographer_id", me.photographer.id).eq("status","new")`로 소유권+상태 동시 가드(`actions.ts:216-222`). `confirmInquiryDeposit`/`revertInquiryDeposit`는 from-status 가드 존재(accepted/confirmed). 입금확인 시 작가 알림 정상 전송.

---

## 6. 채팅 (메시지·포트폴리오 사진 전송·나가기)

### [중간] 스튜디오 채팅 라우트 완전 비활성 — `studio/chat/page.tsx`는 dead code
- 위치: `src/app/(photographer)/studio/chat/layout.tsx`(무조건 `redirect("/studio")`)
- 현상: 작가 채팅 layout이 자식 렌더 전 무조건 `/studio`로 리다이렉트. 그 아래 `page.tsx`(+ `listChatRooms`)는 도달 불가.
- 영향: 의도된 비활성화면 OK이나, 직접 URL 접근도 layout이 막으므로 보안 누수는 없음. 단 `listChatRooms`/`fillCustomerNames`(service_role) 등 죽은 코드가 유지보수 부채.
- 제안 수정: 의도 확정 후 page/코드 제거 또는 활성화. (현재 채팅은 `(user)/chat` 단일 경로로 통합된 것으로 보임.)

### [낮음] `sendPortfolioPhoto`가 `image_path`에 URL 저장(컬럼 의미 불일치)
- 위치: `src/app/(user)/chat/actions.ts:65-71`
- 현상: `messages.image_path`에 storage key가 아니라 공개 URL(`photo.thumb_url ?? photo.src_url`)을 저장. 컬럼명은 path를 암시.
- 영향: 현재 렌더는 URL 그대로 쓰면 동작하나, 다른 코드가 `image_path`를 storage key로 가정하면 깨짐(잠재 일관성 버그).
- 제안 수정: 컬럼 의미 정리(별도 `image_url` 컬럼) 또는 storage path 저장 후 signed URL 변환.

**[이상 없음]** `sendPortfolioPhoto`는 대화 참여 + 사진 `visibility==="published"` + 사진 소유 작가 검증(`actions.ts:50-60`). 메시지 insert는 `messages_insert` RLS(`sender_id=auth.uid()` + 참여자, `0001:442`). `leaveConversation`은 라이브 예약 있으면 숨김만(삭제 안 함). 작가 시점 고객 이름 보강은 이미 RLS 통과한 대화에 한해 service_role로 `display_name`만(`chat.ts fillCustomerNames`).

---

## 7. 예약 제안 (ProposeBookingButton / BookingComposer / 상태머신)

상태머신(코드 추적 결과, enum `requested/accepted/paid/shot/delivered/completed/rejected/cancelled/refunded` 대조):

| 전이 | 함수 | 가드/주체 | 부수효과 |
|---|---|---|---|
| →`requested` | `proposeBooking` (`actions/bookings.ts:104-121`) | 참여자, admin insert(작가 제안 위해 RLS 우회) | `proposed_by_photographer` 기록 |
| `requested`→`requested`(편집) | `updateBooking` (`:152-192`) | 구매자만 + status=`requested` | 금액/스냅샷 재계산 |
| `requested`→`accepted` | `acceptBooking` (`:216-265`) | 제안자 반대편; 시간중첩 충돌 스캔(`:243-259`) | `accepted_at` |
| `requested`→`rejected` | `rejectBooking` (`:287-302`) | 반대편 | — |
| `requested`/`accepted`→`cancelled` | `cancelBooking` (`:324-339`) | 구매자/작가 | `cancelled_at` |
| `accepted`→`paid` | `confirmBankTransfer` (`lib/payments.ts:190-211`) | 작가 + status=accepted(원자적) | payments paid + platform_fees accrued |
| `paid`→`shot` | `markShot` (`payments.ts:125-131`) | 작가 + status=paid(원자적) | — |
| `paid`/`shot`→`completed` | `deliverFinals` (`payments.ts:151-183`) | 작가; status∈[paid,shot]; 파일/링크 필수 | delivered_at+completed_at (delivered 단계 건너뜀) |
| `shot`→`delivered` | `markDelivered` (`payments.ts:286`, 레거시) | 작가 + status=shot | — |
| `delivered`→`completed` | `confirmCompletion` (`payments.ts:308`, 레거시) | 구매자 + status=delivered | — |
| `paid`/`shot`/`delivered`→`refunded` | `refundBooking` (`payments.ts:335-369`) | 구매자/운영자 | payments refunded, waiveFee, **availability.is_booked=false(죽은 코드)** |

### [높음] `deliverFinals` 최종 UPDATE에 status 가드 없음(TOCTOU)
- 위치: `src/app/actions/payments.ts:151-183`
- 현상: `:151-157`에서 status를 읽고 in-array 체크 후, `:180-183`에서 `.update({status:"completed", ...}).eq("id", id)` — status 조건 없음(read-then-write 비원자).
- 원인: markShot/confirmBankTransfer는 `.eq("status",...)` 원자적 전이인데 여기만 누락.
- 영향: 동시 `refundBooking`과 경합 시 `refunded`로 바뀐 예약을 `completed`로 덮어쓸 수 있음(상태 역행/정합성 붕괴). 정산·환불 분쟁 소지.
- 제안 수정: 최종 update에 `.eq("status", <읽은 status>)` 또는 `.in("status", ["paid","shot"])` 추가하고 0행이면 에러.

### [중간] `updateBooking`도 동일 TOCTOU 계열
- 위치: `src/app/actions/bookings.ts:152-192`
- 현상: `:158`에서 `status !== "requested"` 체크하나 비원자 read 후 `:180` update에 status `.eq` 없음. 동시 `acceptBooking`이 끼면 accepted된 예약에 구매자 편집이 적용될 수 있음.
- 제안 수정: update에 `.eq("status","requested")` 추가.

### [중간] `proposeBooking` 중복 활성 제안 방지 없음 + conversations.booking_id 덮어쓰기
- 위치: `src/app/actions/bookings.ts:104-125`
- 현상: 동일 대화에 기존 `requested` 예약 존재 확인 없이 매번 새 bookings 행 생성. 매 제안마다 `conversations.booking_id`를 덮어써 이전 카드 연결이 끊김(고아화).
- 영향: 데이터 증가 시 동일 대화에 다수 `requested` 누적, 이전 예약 카드 추적 불가.
- 제안 수정: 기존 활성 제안 존재 시 재사용/거절 강제, 또는 conversation당 단일 활성 제안 제약.

### [낮음] `acceptBooking` 충돌 스캔 기본 60분 fallback
- 위치: `src/app/actions/bookings.ts:239,254`
- 현상: `duration_min`/`package_snapshot.duration_min` 둘 다 null이면 60분으로 가정해 중첩 판정. 과소/과대 블록 가능.
- 제안 수정: duration 필수화 또는 보수적 기본값.

### [낮음] `proposeBooking`이 service_role로 `bookings_insert` RLS(`user_id=auth.uid()`) 우회
- 위치: `src/app/actions/bookings.ts:104-121`
- 현상: 작가가 제안할 때 booking의 `user_id`는 고객이므로 클라이언트 RLS(`user_id=auth.uid()`, `0001:428`)로는 불가 → admin insert로 우회. 참여자 검증(`:74-76`)은 코드로 수행.
- 영향: 의도된 설계(작가 제안 지원). 단 참여자 검증이 코드에만 의존(RLS 백스톱 없음). 검증됨 — 현재 가드 존재.

**[이상 없음]** `confirmBankTransfer`/`markShot`/`markDelivered`/`confirmCompletion`/`markTransferSent`는 `.eq("status",...)` 원자적 전이로 race 방어. accept 시 시간중첩 충돌 스캔 존재. platform_fees는 `onConflict:"booking_id", ignoreDuplicates`로 중복 발생 방지.

---

## 8. 정산 / 수수료 (platform_fees / payments)

### [높음] 리드(문의) 모델에서 `settlements`(수수료) 페이지는 항상 빈 유물 라우트
- 위치: `src/app/(photographer)/studio/settlements/page.tsx`; `src/lib/payments.ts:97-107`(listMyFees), `:241`(알림 링크)
- 플로우/현상: `settlements` 페이지는 `platform_fees`(booking 기반) 행을 표시. 그러나 `platform_fees`는 오직 `confirmBankTransfer`(인앱 예약 결제 경로, `lib/payments.ts:214-224`)에서만 생성됨. 현재 실제 수익 흐름인 **리드(inquiry) 입금 모델은 `platform_fees`를 전혀 생성하지 않음**(`acceptInquiry`/`confirmInquiryDeposit` 어디서도 platform_fees insert 없음).
- 원인: 모델 전환(예약결제→리드입금) 후 정산 페이지·알림이 구 booking 기반 platform_fees를 가리킨 채 방치.
- 영향: 리드 모델 운영 중에는 작가 수수료 페이지가 항상 비어 보임. `payments.ts:241`의 알림이 `/studio/settlements`로 보내면 빈 페이지 도달. 작가에게 부과되는 실제 매칭 수수료(문의 건당 6,000원)의 원장이 코드상 존재하지 않음 → **정산 미구현 공백**.
- 제안 수정: (a) 리드 입금 확인 시 수수료 원장 생성 경로 신설(inquiry→fee), 또는 (b) settlements 페이지·알림을 inquiry 입금 기준으로 재설계, 또는 (c) 현 시점 미사용이면 라우트/알림 제거.

### [중간] settlements 라우트가 사이드바에서 숨겨졌으나 직접 URL 접근 가능
- 위치: `src/app/(photographer)/studio/StudioSidebar.tsx:22-25`(주석 처리), 라우트 `/studio/settlements`는 생존
- 현상: 네비에서 "수수료" 메뉴 숨김. 그러나 페이지 자체는 가드(비로그인/비작가 redirect)만 있고 라우트는 살아 직접 URL 접근 가능(빈 데이터 노출).
- 영향: 보안 누수는 없음(작가 본인 데이터만, RLS `platform_fees_select`). 죽은/혼란 라우트.
- 제안 수정: §8-높음과 함께 정리.

**[이상 없음]** `payout_accounts`(작가 수취계좌)는 소유자/운영자만 조회(`0007:35` RLS). `platform_fees_select`는 `is_my_photographer or is_admin`(`0007:67`). `listMyFees`는 RLS로 본인 행만(필터 없이 RLS 의존이나 정책상 안전). `settlements` 테이블은 코드 어디서도 참조 안 함(0007 DROP 반영됨).

---

## 9. 스튜디오 네비 / 숨긴 라우트 직접 접근

- StudioSidebar(`StudioSidebar.tsx`)는 클라이언트 네비, 쿼리/가드 없음. "수수료"(settlements) 메뉴는 주석 처리(`:22-25`).
- 숨겨진 라우트 점검:
  - `/studio/settlements`: 가드 있음(비로그인/비작가 redirect). 직접 접근 시 빈 platform_fees 노출(보안 무해, §8 참조).
  - `/studio/chat`: layout이 무조건 `/studio` redirect → 접근 불가(§6).
  - `/studio/availability`, `/studio/booking`, `/studio/bookings`, `/studio/highlights`, `/studio/packages`, `/studio/profile`, `/studio/reviews`, `/studio/portfolio`: 각 page가 `getCurrentUser` + `me.photographer` 가드 후 redirect. RLS/소유권은 위 각 섹션 참조.

### [낮음] 페이지 가드가 `me.photographer` 존재만 확인(status 무관)
- 위치: 대부분 studio 하위 page (예: `packages/page.tsx:14-16`, `profile/page.tsx:20-22`)
- 현상: `!me.photographer`만 체크 → `pending/suspended/rejected` 작가도 스튜디오 기능 페이지(프로필/패키지/포트폴리오 등) 접근·수정 가능. layout(`studio/layout.tsx:7-11`)은 미승인이면 사이드바만 숨기고 children은 렌더.
- 영향: 미승인 작가가 직접 URL로 프로필/패키지/포트폴리오를 작성·수정 가능. 단 photos/packages는 `visibility`/`is_active`로 공개 게이트되고 미승인 작가는 탐색 노출 안 됨 → 실위험은 낮으나 미승인 단계 권한 경계가 느슨.
- 제안 수정: 기능 페이지 가드를 `status === "approved"` 기준으로 통일(또는 layout에서 미승인 시 redirect).

---

## 10. 작가 본인 계정 탈퇴 시 FK 정리 (`settings/actions.ts deleteAccount`)

### [중간] 탈퇴 시 상대방(고객) 예약까지 일괄 삭제 — 데이터 손실/분쟁 소지
- 위치: `src/app/(user)/settings/actions.ts:59-79`
- 현상: 작가 탈퇴 시 `asPh`(이 작가가 photographer인 모든 예약)를 수집해 `bookings`/`payments`/`platform_fees`를 아카이브 후 삭제. 이 예약들의 `user_id`는 **다른 고객**임. 즉 고객의 거래 기록이 작가 탈퇴로 함께 삭제됨(soft-delete 아카이브엔 남지만 고객 화면에서 사라짐).
- 원인: `bookings.user_id`/`photographer_id`가 `ON DELETE restrict`(`0001:185-186`)라 profiles/photographers CASCADE 삭제 전에 예약을 직접 제거해야 함 → 상대 예약까지 포괄.
- 영향: 작가 탈퇴 한 번에 다수 고객의 완료/거절/취소 예약 이력이 라이브에서 제거. 환불·분쟁 추적 곤란. (진행중 예약은 `:67`에서 차단되나 completed/rejected/cancelled/refunded는 삭제됨.)
- 제안 수정: 작가 탈퇴 시 본인 photographer 행만 비활성(soft) 처리하거나, 상대 예약은 photographer 참조를 `set null`로 보존하는 정책 재설계 검토(현 `restrict`가 강제 삭제를 유발).

### [낮음] `reviews`/`deliveries` 등 잔여 FK는 CASCADE로 정리되나 reviews는 booking 삭제로 사라짐
- 위치: `bookings` 삭제 시 `reviews.booking_id`(cascade, `0001:288`)·`deliveries.booking_id`(cascade, `0001:277`) 자동 삭제
- 현상: 작가 탈퇴로 고객이 남긴 후기까지 삭제. rating 집계 트리거는 작가가 사라지므로 무의미하나, 고객 후기 손실.
- 영향: §10-중간과 동일 맥락(상대 데이터 손실).
- 제안 수정: 위와 함께 보존 정책 재검토.

**[이상 없음]** 진행중(accepted/paid/shot/delivered) 예약 차단(`:67`), RESTRICT 자식(platform_fees/payments) 선정리 후 bookings 삭제 순서, profiles 아카이브 후 CASCADE(대화/메시지/찜/알림/작가/포트폴리오/하이라이트), auth 계정 삭제·세션 정리는 논리적으로 정합. `inquiries.photographer_id`(cascade)·`inquiries.profile_id`(set null)도 정상 처리됨.

---

## 11. 배송 / 납품 (`api/delivery`, deliveries 테이블)

**[이상 없음]** `delivery/upload/route.ts`는 전 경로 service_role + booking 소유권(`:48`)·status 게이트(`:52`) 검증. `deliveries`는 `booking_id` unique(`0001:277`)로 1:1. signed URL은 `signDeliveryAssets`(service_role)로 발급.

### [낮음] `deliveries.asset_paths` last-write-wins
- 위치: `src/app/api/delivery/upload/route.ts:64-73`; `src/app/actions/payments.ts deliverFinals`
- 현상: `asset_paths` 읽고 append 후 upsert(주석에서 인지). 동일 booking 동시 업로드 시 경로 유실 가능.
- 영향: 작가 1인 작업이라 실위험 낮음.
- 제안 수정: array append를 DB 레벨 원자 연산(RPC) 또는 별도 행으로.

---

## 부록: service_role(RLS 우회) 사용처 — 의도성 판정

| 위치 | 판정 |
|---|---|
| `studio/actions.ts:14-22`(작가명 중복검사), `:216-222`(inquiry 수락), `:227-231`(알림 읽음) | 적절(inquiries 정책 0개라 admin 필수) |
| `lib/inquiries.ts:43-84` | 필수(정책 0개) — 단 §5 치명 참조 |
| `lib/payments.ts`(confirmBankTransfer/markShot/deliverFinals/refund 등) | 적절(돈·상태 전이 서버 전용) — 단 deliverFinals status 가드 §7 높음 |
| `actions/bookings.ts`(propose/accept/reject/cancel/update) | 적절(작가 제안 위해 RLS 우회) — 참여자 가드는 코드 의존 |
| `lib/reviews.ts:33-47` | **위험(§4 높음)** — 호출자 가드에만 의존 |
| `lib/chat.ts fillCustomerNames` | 적절(이미 RLS 통과 대화에 한해 이름만) |
| `admin/inquiries`·`admin/users` actions/page | 적절(운영자 전용, assertAdmin) |
| `admin/photographers` approve | **service_role 미사용**(RLS 의존) — §1 중간 |

---

## 최종 메모

- **치명 2건**이 작가 온보딩과 데이터 보호의 정중앙을 관통한다: (1) 승인 페이지가 `handle` 조회로 깨져 작가가 영원히 pending에 묶이고, (2) inquiries RLS 정책 부재로 고객 연락처 보호가 앱 코드 한 줄에만 매달려 있다.
- **높음 3건**은 정산 공백(리드 모델에서 수수료 원장 미생성), deliverFinals 상태 레이스, reviews service_role 권한 누수.
- 다수의 "RLS 단독 의존" 패턴(packages/photos update)은 정책이 실재해 현재는 안전하나 방어 심층화가 빠져 있다.
</content>
</invoke>
