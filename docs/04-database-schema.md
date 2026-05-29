# 04. 데이터베이스 스키마

> Postgres (Supabase). 모든 테이블은 RLS 활성화. 시간은 `timestamptz`, UTC 저장 / UI에서 KST 표시.
> PK는 `uuid default gen_random_uuid()`, 공통으로 `created_at`/`updated_at` 보유(트리거로 갱신).
> 본 문서는 설계 명세이며, 실제 SQL 마이그레이션은 0단계에서 작성한다.

## ERD 개요

```
auth.users (Supabase)
   │ 1:1
profiles ──────────────┐
   │ 1:1 (작가 자격)      │ 1:N (찜)
photographers           favorites
   │ 1:N      │ 1:N        │
packages   photos      ───┘
   │           │ (탐색 갤러리 소스)
   │
   └──────┐
          │
bookings ─┼─ 1:1 ─ payments
   │ │ │  └─ 1:1 ─ settlements
   │ │ └─ 1:1 ─ deliveries
   │ └─ 1:1 ─ reviews
   │ (user_id, photographer_id, package_id)
   │
conversations ── 1:N ── messages
   (user_id, photographer_id, booking_id?)

availability (photographer_id)
notifications (recipient profile_id)
```

## Enum 타입

```
user_role:        user | admin          # 작가 여부는 photographers(approved) 행 존재로 판단
photographer_status: pending | approved | suspended | rejected
booking_status:   requested | accepted | paid | shot | delivered
                  | completed | rejected | cancelled | refunded
payment_status:   pending | paid | failed | cancelled | refunded | partial_refunded
settlement_status: pending | scheduled | paid | held
message_type:     text | image | system
notification_type: chat | booking | payment | settlement | review | system
photo_visibility: published | draft | archived
```

---

## 인증·계정

### `profiles`
`auth.users`를 1:1로 확장. 가입 시 트리거로 자동 생성.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | = auth.users.id (FK) |
| role | user_role | 기본 `user`. 운영자만 `admin`. **작가 여부는 별도 role이 아니라 `photographers`(approved) 행 존재로 판단** → 한 사람이 유저이자 작가 가능 |
| display_name | text | 표시 이름 |
| avatar_url | text | |
| phone | text (암호화 권장) | 알림·연락 |
| created_at / updated_at | timestamptz | |

RLS: 본인 행 select/update. 공개 노출은 작가 프로필을 통해서만.

### `photographers`
작가 자격·공개 프로필. profiles와 1:1(작가 신청한 유저만 존재).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| profile_id | uuid FK → profiles | unique (1인 1작가) |
| handle | text unique | URL 슬러그 (`/photographers/{handle}`) |
| status | photographer_status | `pending`→운영자 승인→`approved` |
| display_name | text | 작가명 |
| bio | text | 소개 |
| regions | text[] | 활동 지역 (예: 성수, 한강) |
| mood_tags | text[] | 무드 태그 (필름, 내추럴, 에디토리얼…) |
| price_from_krw | int | 최저가(표시용, 패키지에서 집계 가능) |
| hero_photo_id | uuid FK → photos (nullable) | 대표 사진 |
| rating_avg | numeric(2,1) | 후기 집계(트리거/배치) |
| review_count | int | 집계 |
| settlement_account | jsonb (암호화) | 정산 계좌(은행·번호·예금주) |
| approved_at | timestamptz | |
| created_at / updated_at | | |

RLS: 공개 read는 `status='approved'`만. 본인은 전체 read/update(단 status·정산확정 등은 서버 only).

---

## 공급·탐색

### `packages`
작가가 파는 상품.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| photographer_id | uuid FK | |
| name | text | 예: "데이트 스냅 베이직" |
| description | text | |
| duration_min | int | 촬영 소요(분) |
| edited_count | int | 보정본 장수 |
| price_krw | int | 가격 |
| is_active | bool | 노출 여부 |
| sort_order | int | |

RLS: 공개 read(active + 승인 작가). 본인 작가만 write.

### `photos`
포트폴리오 사진 = **탐색 갤러리의 소스**.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| photographer_id | uuid FK | |
| storage_path | text | Storage 키 |
| src_url | text | 공개 URL |
| thumb_url | text | 썸네일 |
| width / height | int | 레이아웃용 |
| mood_tags | text[] | 필터용 |
| region | text | 필터용 |
| visibility | photo_visibility | `published`만 탐색 노출 |
| sort_order | int | |

RLS: 공개 read(`published` + 승인 작가). 본인 작가만 write.
인덱스: `(visibility, region)`, GIN(`mood_tags`).

### `favorites`
유저 찜.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| profile_id | uuid FK | 찜한 유저 |
| target_type | text | `photographer` \| `photo` |
| target_id | uuid | |
| created_at | | |

unique(profile_id, target_type, target_id). RLS: 본인만.

---

## 채팅

### `conversations`
유저↔작가 1:1. 예약 전 문의부터 생성 가능.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| user_id | uuid FK → profiles | |
| photographer_id | uuid FK → photographers | |
| booking_id | uuid FK → bookings (nullable) | 예약과 연결되면 채움 |
| last_message_at | timestamptz | 정렬용 |
| user_unread / photographer_unread | int | 안읽음 수 |

unique(user_id, photographer_id) — 한 쌍당 한 방. RLS: 참여자(user 또는 작가 본인)만.

### `messages`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| conversation_id | uuid FK | |
| sender_id | uuid FK → profiles | |
| type | message_type | text \| image \| system |
| body | text | |
| image_path | text (nullable) | Storage 키 |
| read_at | timestamptz (nullable) | |
| created_at | | |

RLS: 해당 대화 참여자만 read/insert. Realtime 구독 대상.
인덱스: `(conversation_id, created_at)`.

---

## 예약 (거래의 심장)

### `bookings`
모든 거래 상태의 단일 진실. 상태 전이 규칙은 [05](05-booking-lifecycle.md).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| user_id | uuid FK → profiles | 예약자 |
| photographer_id | uuid FK → photographers | |
| package_id | uuid FK → packages (nullable) | 스냅샷 권장 |
| status | booking_status | 기본 `requested` |
| shoot_at | timestamptz | 촬영 일시 |
| location_text | text | 장소 |
| amount_krw | int | 확정 금액(스냅샷) |
| package_snapshot | jsonb | 패키지 변경 대비 당시 내용 보존 |
| memo | text | 협의 메모 |
| requested_at / accepted_at / paid_at / shot_at / delivered_at / completed_at / cancelled_at | timestamptz | 전이 타임스탬프 |
| cancel_reason | text | |
| created_at / updated_at | | |

RLS: 본인(user) 또는 해당 작가만 read. **status 전이는 서버 라우트/RPC only** (클라이언트 직접 update 금지).
인덱스: `(photographer_id, status)`, `(user_id, status)`, `(shoot_at)`.

### `availability`
작가 가능 시간 슬롯 (v1 단순화: 가능 슬롯 등록 방식).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| photographer_id | uuid FK | |
| start_at / end_at | timestamptz | |
| is_booked | bool | 예약 확정 시 true |

RLS: 공개 read(승인 작가), 본인 작가 write.

---

## 결제·정산

상세 흐름·규제는 [06](06-payment-settlement.md).

### `payments`
유저 결제 1건. 예약과 1:1(부분환불 대비 amount 분리).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| booking_id | uuid FK | unique |
| status | payment_status | |
| provider | text | `portone` \| `toss` |
| pg_tx_id | text | PG 거래 고유 ID |
| amount_krw | int | 결제 금액 |
| refunded_krw | int default 0 | 환불 누계 |
| idempotency_key | text unique | 멱등 |
| raw | jsonb | PG 응답 원본(감사) |
| paid_at / cancelled_at | timestamptz | |

RLS: 본인 예약 read만. write는 **서버 webhook/라우트 only**.

### `settlements`
작가 정산 1건. 전달 확인 후 확정.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| booking_id | uuid FK | unique |
| photographer_id | uuid FK | |
| gross_krw | int | 결제 총액 |
| fee_krw | int | 플랫폼 수수료 |
| net_krw | int | 작가 수령액 |
| status | settlement_status | pending→scheduled→paid |
| scheduled_at / paid_at | timestamptz | |

RLS: 작가 본인 read. write는 서버 only.

---

## 전달·후기

### `deliveries`
보정본 전달.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| booking_id | uuid FK | unique |
| asset_paths | text[] | 보정본 Storage 키들 |
| expires_at | timestamptz | 다운로드 만료 |
| confirmed_at | timestamptz | 유저 전달 확인(→정산 트리거) |
| created_at | | |

RLS: 해당 예약의 user/작가만. 다운로드는 만료 서명 URL.

### `reviews`
1예약 1후기, 거래 완료(`completed`)자만.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| booking_id | uuid FK | unique |
| user_id / photographer_id | uuid FK | |
| rating | int (1~5) | |
| body | text | |
| created_at | | |

RLS: 공개 read(작가 프로필 노출), 작성은 본인 + 완료 예약 검증(서버).
후기 생성 시 트리거로 `photographers.rating_avg/review_count` 갱신.

---

## 운영

### `notifications`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| recipient_id | uuid FK → profiles | |
| type | notification_type | |
| title / body | text | |
| link | text | 딥링크 |
| read_at | timestamptz | |
| created_at | | |

RLS: 본인만. Realtime 구독.

---

## RLS 설계 원칙 (요약)

1. **기본 거부** — RLS 켜고 정책 없으면 클라이언트 접근 불가 (service_role만)
2. **공개 read 화이트리스트** — 승인 작가의 published photos / active packages / 공개 프로필 / reviews
3. **본인 스코프** — profiles, favorites, bookings(참여자), conversations/messages(참여자), notifications
4. **상태·돈은 서버 only** — bookings 상태 전이, payments/settlements write는 RLS로 클라이언트 차단하고 service_role 서버 경로로만
5. **민감정보 분리** — 정산계좌·전화는 암호화. 작가 본인/운영자 외 노출 금지

## 다음 단계

이 명세를 0단계에서 `supabase/migrations/0001_init.sql` 로 구현. enum → 테이블 → 인덱스 → RLS 정책 → 트리거(updated_at, profiles 자동생성, 후기 집계) 순.
