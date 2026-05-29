# 03. 아키텍처

## 시스템 구성도

```
┌─────────────────────────────────────────────────────────────┐
│                        브라우저 (반응형 웹)                      │
│   유저 / 작가 / 운영자  ── 동일 앱, role 기반 라우팅 분기          │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS
┌───────────────▼─────────────────────────────────────────────┐
│                    Next.js 16 (Vercel)                        │
│  ┌──────────────────┐   ┌─────────────────────────────────┐  │
│  │ Server Components │   │ Route Handlers (/api/*)         │  │
│  │ (SSR 페이지·조회)  │   │ 결제 webhook · 정산 · 민감 작업    │  │
│  └────────┬─────────┘   └──────────────┬──────────────────┘  │
│           │ anon key (RLS)             │ service_role (서버)   │
└───────────┼────────────────────────────┼─────────────────────┘
            │                            │
┌───────────▼────────────────────────────▼─────────────────────┐
│                         Supabase                              │
│  Auth(카카오·이메일) · Postgres(RLS) · Storage · Realtime       │
└───────────────────────────────────────────────────────────────┘
            │                                   │
   ┌────────▼─────────┐              ┌──────────▼──────────┐
   │  PG (포트원/토스)  │              │  카카오 OAuth        │
   │  결제·정산         │              │                     │
   └──────────────────┘              └─────────────────────┘
```

## 클라이언트 vs 서버 접근 분리 (핵심 규칙)

| 작업 유형 | 경로 | 키 |
|-----------|------|-----|
| 본인 데이터 조회/수정 (프로필, 내 예약, 내 채팅) | 클라이언트/서버 컴포넌트 → Supabase | **anon key + RLS** |
| 공개 데이터 조회 (탐색 갤러리, 작가 공개 프로필) | 서버 컴포넌트 | anon key + RLS(public read) |
| 민감/정합성 작업 (결제 확정, 정산, 예약 상태 전이, 작가 승인) | **Route Handler / RPC** | **service_role (서버 only)** |
| 외부 webhook (PG 결제 결과) | `/api/payments/webhook` | service_role + 서명 검증 |

> 원칙: **돈·상태를 바꾸는 일은 클라이언트가 직접 못 한다.** 반드시 서버 라우트나 Postgres 함수(RPC)를 통해서만.

## Next.js 라우트 구조 (예정)

App Router의 route group으로 역할/영역을 분리한다.

```
src/app/
  (auth)/                  로그인·회원가입·소셜 콜백
    login/
    signup/
    callback/

  (user)/                  유저 영역 (탐색·예약·채팅)
    page.tsx               탐색 홈 (갤러리)  ← 랜딩 탐색 구조 참고
    explore/
    photographers/[handle]/  작가 공개 프로필  ← 랜딩 프로필 UI 참고
    bookings/              내 예약 목록·상세
    chat/[conversationId]/ 채팅방
    reviews/

  (photographer)/          작가 영역 (대시보드)
    studio/
      profile/             프로필·활동지역·정산계좌
      packages/            패키지 관리
      portfolio/           포트폴리오 사진
      availability/        가능 시간
      bookings/            받은 예약 관리
      settlements/         정산 내역

  (admin)/                 운영자 영역
    admin/
      photographers/       작가 승인
      bookings/            거래 모니터링
      settlements/         정산 처리
      disputes/            분쟁

  api/                     Route Handlers
    payments/
      prepare/             결제 사전등록(금액 검증)
      webhook/             PG 결과 수신 (서명 검증)
    bookings/[id]/transition/   예약 상태 전이(서버 검증)
    settlements/run/       정산 확정
    uploads/               서명 URL 발급
```

## 인증 흐름

1. 카카오 소셜 또는 이메일로 로그인 → Supabase Auth가 `auth.users` 생성
2. 트리거로 `public.profiles` 행 자동 생성 (기본 role = `user`)
3. **작가 전환**: 유저가 "작가 신청" → `photographers` 행(status=`pending`) 생성 → 운영자 승인 시 `approved`
4. `profiles.role`은 `user`/`admin`만 구분. **작가 여부는 `photographers`(approved) 행 존재로 판단** → 한 사람이 유저이자 작가일 수 있고, 작가도 다른 작가에게 예약 가능. 운영자(`admin`)는 허용 목록 기반

## 채팅 아키텍처

- `conversations`(유저↔작가 1:1) + `messages` 테이블
- 클라이언트가 `messages`를 INSERT → **Supabase Realtime** 구독으로 상대에게 즉시 전파
- 사진 전송: Storage 업로드 → 메시지에 경로 저장
- 읽음 처리: `messages.read_at` 또는 `conversation_reads` 갱신
- 알림: 새 메시지·예약 변경 시 `notifications` INSERT → Realtime로 푸시 (웹푸시는 추후)

## 결제·정산 흐름 (요약)

상세 상태머신은 [05](05-booking-lifecycle.md), 규제·PG는 [06](06-payment-settlement.md).

```
예약 수락 → 유저 결제(PG) → 플랫폼 보류(에스크로)
→ 촬영 → 보정본 전달 → 유저 전달 확인
→ 정산 확정(수수료 차감 후 작가 입금) → 완료
            └ 분쟁/취소 시 환불 분기
```

- 결제 결과는 **PG webhook을 신뢰의 원천**으로 삼는다 (클라이언트 콜백은 UX용, 확정은 서버 webhook)
- 모든 결제/정산 행위는 멱등키 + `payments`/`settlements` 감사 레코드

## 이미지 파이프라인

- 업로드: 클라이언트 → 서버에서 서명 URL 발급 → Storage 직접 업로드
- 변환: `sharp`로 썸네일/리사이즈 (포트폴리오·채팅 사진)
- 보정본: 별도 버킷, **만료 서명 URL**로만 다운로드 (구매자 검증)

## 보안 요약

- 전 테이블 RLS, 본인 스코프 제한
- service_role은 서버 전용
- 민감정보(정산계좌·전화) 암호화 저장, 최소 수집
- 결제 webhook 서명 검증, 금액은 서버 보관값과 대조
