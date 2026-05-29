# 02. 기술 스택

## 결정 요약

| 영역 | 선택 | 비고 |
|------|------|------|
| 프레임워크 | **Next.js 16 (App Router)** | 풀스택. 서버 컴포넌트 + Route Handler로 API |
| 언어 | **TypeScript** | 전 영역 |
| 백엔드/DB | **Supabase (Postgres)** | 단일 BaaS로 아래 4개 통합 |
| 인증 | **Supabase Auth** | 카카오 소셜 + 이메일. role은 `profiles`로 확장 |
| 스토리지 | **Supabase Storage** | 포트폴리오·채팅 이미지·보정본 |
| 실시간 | **Supabase Realtime** | 채팅 메시지·읽음·알림 |
| 결제·정산 | **포트원 또는 토스페이먼츠** | [06 문서](06-payment-settlement.md)에서 확정 |
| 스타일링 | **Tailwind CSS v4** | 랜딩 디자인 토큰 이식 |
| 배포 | **Vercel (웹) + Supabase (백엔드)** | |
| 이메일/알림 | (추후) Resend/SMTP + 웹푸시 | v1은 인앱 알림 우선 |

## 왜 Next.js + Supabase 인가

거래 완결형 마켓플레이스는 단순 CRUD가 아니라 **인증·실시간 채팅·파일 저장·결제**를 한 번에 요구한다.
Supabase는 이 네 가지(Auth·Postgres·Storage·Realtime)를 한 제품에서 제공하므로 **별도 백엔드를 구축하지 않고도** v1을 가장 빠르게 검증할 수 있다.

- **속도**: 백엔드 인프라(인증 서버, 웹소켓 서버, 파일 스토리지)를 직접 운영하지 않음
- **Postgres 그대로**: RLS·트랜잭션·외래키 등 관계형 DB의 강점을 결제/정산 같은 정합성 중요한 도메인에 활용
- **확장 경로**: 검증 후 무거운 로직(정산 배치 등)은 Supabase Edge Functions 또는 별도 워커로 분리 가능
- **모바일 확장**: 동일 Supabase 백엔드를 추후 네이티브 앱이 그대로 사용

## 검토했지만 선택하지 않은 대안

| 대안 | 트레이드오프 | 결론 |
|------|--------------|------|
| Next.js + 자체 백엔드(NestJS/Prisma) | 결제·정산·예약 로직을 정교하게 다루기 좋지만 인증·실시간·스토리지를 직접 구축 → v1까지 2~3배 | v1 검증 속도 우선 → 보류. 정산이 복잡해지면 일부만 분리 |
| 모바일 앱(RN/Flutter) 우선 | 사진 서비스에 적합하나 v1 검증 속도 최저, 심사 부담 | 반응형 웹으로 먼저 검증 후 추가 |
| Firebase | 실시간·인증 강점이나 관계형(결제/정산 정합성)·SQL 약점 | 관계형 DB가 거래 도메인에 유리 → Supabase |

## 주요 라이브러리 (예정)

- `@supabase/supabase-js`, `@supabase/ssr` — 클라이언트/서버 인증 연동
- 결제: 포트원(`@portone/browser-sdk`) 또는 토스페이먼츠 SDK
- `sharp` — 이미지 썸네일 변환(서버)
- `zod` — 입력 검증(폼·API)
- 날짜: `date-fns` (예약 일정)
- UI: Tailwind + 필요 시 Radix/shadcn (접근성 컴포넌트)

## 환경 변수 (예정 골격)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # ⚠️ 서버 only, NEXT_PUBLIC_ 금지

# 소셜 로그인 (Supabase Auth Provider에 등록)
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=

# 결제 (PG 확정 후)
PORTONE_API_SECRET=               # 또는 토스 시크릿
PAYMENT_WEBHOOK_SECRET=

# 운영
ADMIN_ALLOWLIST=                  # 운영자 이메일/ID
```

## 보안 원칙

- `service_role` 키는 **서버 전용**. 클라이언트 번들에 절대 포함 금지
- 모든 테이블 **RLS 활성화**. 클라이언트 직접 접근은 본인 데이터로 제한, 민감 작업은 서버 라우트/RPC 경유 ([04 문서](04-database-schema.md))
- 결제/정산 변경은 서버에서만, 멱등키·감사로그 동반
