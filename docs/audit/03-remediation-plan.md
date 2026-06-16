# 통합 수정 계획 (Remediation Plan)

> 두 감사(`01-user-flow-audit.md`, `02-photographer-flow-audit.md`)를 종합한 우선순위별 수정 계획.
> 작성: 2026-06-16 · 두 에이전트가 독립적으로 교차 확인한 이슈는 신뢰도 ★.

## 교차 확인된 치명 이슈 (양쪽 에이전트 일치) ★
| # | 이슈 | 위치 | 수정 유형 |
|---|------|------|----------|
| C1 | 문의 제출 즉시 **알림 본문에 고객 연락처 평문 노출** → 리드 언락 모델 우회 | `inquiry/actions.ts:244-257,230-237` | 코드 |
| C2 | **`inquiries` RLS 정책 전무** — 연락처 보호가 앱 코드 한 줄에만 의존 | `0029_inquiries.sql:41` | SQL |
| C3 | **작가 승인 페이지가 드롭된 `handle` 컬럼 조회 → 온보딩 전면 마비** | `admin/photographers/page.tsx:37,97,121` | 코드 |
| C4 | **reviews RLS가 "본인+완료예약" 미강제** → 후기/별점 위조 | `0001_init.sql:465-466` | SQL |

## 높음
| # | 이슈 | 위치 | 유형 |
|---|------|------|------|
| H1 | `deliverFinals` TOCTOU(상태 가드 없음) | `payments.ts:151-183` | 코드 |
| H2 | `refundBooking` TOCTOU | `payments.ts:335-347` | 코드 |
| H3 | `acceptBooking` 슬롯 비원자 → 이중부킹 | `bookings.ts:243-265` | 코드 |
| H4 | `/api/track` 미인증 공개 POST + service-role insert | `api/track/route.ts` | 코드 |
| H5 | auth callback/confirm 오픈 리다이렉트(`next` 미검증) | `auth/callback`, `auth/confirm` | 코드 |
| H6 | 이메일 가입 차단이 클라이언트 플래그뿐 | `signup/page.tsx:11` | 코드+설정 |
| H7 | 작가 수취계좌 수락 전 채팅 진입만으로 응답 포함 | `chat/[id]/page.tsx:41-43` | 코드 |
| H8 | `reviews` service_role 권한 누수(호출자 가드 의존) | `lib/reviews.ts:33-47` | 코드 |
| H9 | 정산 공백 — 리드 모델에서 수수료 원장 미생성, settlements 유물 라우트 | `studio/settlements`, `payments.ts` | 설계 |

## 청크 분할
- **청크 1 (치명·코드)**: C1 알림 본문 연락처 제거 + C3 승인 페이지 handle 수정 + H7 작가계좌 지연로딩 → 즉시 가능, 충돌 없음.
- **청크 2 (높음·코드)**: H1/H2 TOCTOU 가드, H3 이중부킹 원자화, H5 오픈리다이렉트, H4 /api/track 가드, proposeBooking 패키지 소유검증.
- **청크 3 (SQL 마이그레이션)**: C2 inquiries RLS, C4 reviews RLS, H8 reviews 가드, favorites 무결성 — `0040_*.sql`로 묶어 제공.
- **청크 4 (설계 결정 필요 — 사용자 논의)**: H9 정산 공백, 작가 탈퇴 시 상대 데이터 보존, deleted_records 보존정책, inquiries 탈퇴 PII 마스킹.

## 진행 로그
- [~] 청크 1 (빌드 검증 중)
  - C1 ✅ 알림 본문에서 연락처 제거 + 닉네임 fallback에서 연락처 제거 + 성공 메시지 수정 (`inquiry/actions.ts`)
  - C3 ✅ 승인 페이지 `handle` 컬럼 제거 (`admin/photographers/page.tsx`)
  - H7 ✅ 작가 계좌를 `getBookingPayoutAccount` 서버액션으로 지연 로딩(고객 본인+accepted 게이트). 채팅 진입만으로 계좌가 응답에 실리지 않음 + 수락 직후 즉시 표시(기존 UX 버그도 해소). (`chat/actions.ts`, `chat/[id]/page.tsx`, `ChatRoom.tsx`)
- [ ] 청크 2
- [ ] 청크 3 (SQL)
- [ ] 청크 4 (설계 논의)
