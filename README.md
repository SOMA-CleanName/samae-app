# samae

취향에 맞는 **사진작가를 탐색하고, 채팅으로 협의하고, 예약·결제하고, 보정본을 받는** 거래 완결형 사진작가 매칭 마켓플레이스.

> 이 저장소는 실서비스(v1) 코드베이스입니다. 기존 사전신청 랜딩페이지(`samae-landing`)와는
> **코드·DB·인프라를 공유하지 않습니다.** 랜딩에서는 디자인 톤·탐색 구조·작가 프로필 UI만 참고합니다.

---

## 현재 상태

🟢 **0단계 진행 중 (기반)** — 스캐폴드·스키마·인증 골격 완료. 실제 구동에는 Supabase/카카오 키 연결 필요.

### 0단계 진행 현황
- [x] Next.js 16 + TS + Tailwind v4 스캐폴드 (빌드 통과)
- [x] Supabase 클라이언트 3종(browser/server/admin) + 세션 proxy
- [x] 마이그레이션 `supabase/migrations/0001_init.sql` (스키마·RLS·트리거 전체)
- [x] 인증 골격: 카카오 소셜 + 이메일 로그인, OAuth 콜백, role 가드
- [x] 라우트 그룹 골격 ((auth)/(user)/(photographer)/(admin))
- [ ] **(사용자)** Supabase 새 프로젝트 생성 → `.env.local` 키 입력 + `0001_init.sql` 실행
- [ ] **(사용자)** 카카오 OAuth 앱 등록 → Supabase Auth Providers 연결

### 로컬 실행
```bash
cp .env.example .env.local   # Supabase 키 입력
npm install
npm run dev                  # http://localhost:3000
```

## 문서 인덱스

개발 시작 전 반드시 읽어야 하는 순서대로 정렬했습니다.

| # | 문서 | 내용 |
|---|------|------|
| 01 | [서비스 기능 정의](docs/01-product-overview.md) | 서비스 정의·기능 흐름·v1 기능 범위 |
| 02 | [기술 스택](docs/02-tech-stack.md) | Next.js + Supabase 결정과 근거 |
| 03 | [아키텍처](docs/03-architecture.md) | 시스템 구성·인증·채팅·라우트 구조·보안 |
| 04 | [데이터베이스 스키마](docs/04-database-schema.md) | 전체 테이블·관계·RLS 설계 |
| 05 | [예약 생애주기](docs/05-booking-lifecycle.md) | 예약↔결제↔정산↔전달 상태머신 |
| 06 | [결제·정산](docs/06-payment-settlement.md) | 한국 마켓플레이스 정산·규제·PG 선정 |
| 07 | [개발 로드맵](docs/07-roadmap.md) | 단계별 계획·산출물·완료 기준 |

## 한눈에 보는 스택

- **프론트엔드/풀스택**: Next.js 16 (App Router) — 반응형 웹 우선
- **백엔드/DB/인증/스토리지/실시간**: Supabase (Postgres + Auth + Storage + Realtime)
- **결제·정산**: 포트원 또는 토스페이먼츠 (마켓플레이스 정산) — [06 문서](docs/06-payment-settlement.md) 참고
- **배포**: Vercel (웹) + Supabase (백엔드)

## 개발 원칙

- 코드 주석은 한국어로 작성
- 긴 함수는 단일 책임 원칙(SRP)에 따라 분리
- 모든 거래 상태는 `bookings.status`를 단일 진실(single source of truth)로 둔다
- 클라이언트는 절대 service_role 키에 접근하지 않는다 — 민감 작업은 서버 라우트/RPC로
