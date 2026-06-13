# samae-app — Claude Code 작업 가이드

## ⚠️ 시작 전 필수

**이 프로젝트는 Next.js 16 입니다.** App Router·서버 컴포넌트·캐싱 API가 학습 데이터와 다를 수 있어요. 코드 작성 전 `node_modules/next/dist/docs/` 또는 [Next.js 공식 16 마이그레이션 가이드](https://nextjs.org/docs)를 확인하세요.

**컨텍스트는 README가 아니라 `docs/` 입니다.** 새 기능을 손대기 전 최소 아래 3개는 읽고 시작:
- `docs/01-product-overview.md` — 서비스 정의·기능 흐름
- `docs/03-architecture.md` — 인증·채팅·라우트 구조·보안
- `docs/04-database-schema.md` — 테이블·관계·RLS

결제/예약 작업이면 추가로 `docs/05-booking-lifecycle.md`, `docs/06-payment-settlement.md`.

---

## 프로젝트 위치

- **본서비스(이 repo)**: `~/Documents/git/samae-app` — 거래 완결형 마켓플레이스 (Next.js 16 + Supabase)
- **랜딩(참고용)**: `~/Documents/git/frame-korea-landing` — 사전신청 랜딩 + admin (Vercel Analytics + Google Sheets)

두 repo는 **코드·DB·인프라를 공유하지 않음.** 랜딩에서는 **디자인 톤·타이포·컬러·작가 프로필 UI 패턴만** 참고. 랜딩 코드를 import 하거나 환경변수를 공유하지 말 것.

---

## 스택 (요약)

- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- Supabase: Postgres + Auth(카카오/이메일) + Storage + Realtime
- 결제: 포트원 또는 토스페이먼츠 (마켓플레이스 정산)
- 배포: Vercel (웹) + Supabase (백엔드)

상세 결정 근거는 `docs/02-tech-stack.md`.

---

## 협업 / 커밋 규칙

이 repo는 **SOMA-CleanName 팀 협업** (`github.com/SOMA-CleanName/samae-app`).

- **main 직접 push 금지** — feature 브랜치 + PR
- **커밋 패턴 유지**: 기존 커밋 톤이 `feat: 채팅 — 실시간 메시지·사진·안읽음·알림 (3단계)` 처럼 **단계/청크 단위**임. 동일 패턴 따를 것
- 임의 git 작업 금지 (글로벌 `~/.claude/CLAUDE.md` 규칙 우선)

---

## 작업 단위

- 페이지 단위 또는 기능 단위로 진행 (글로벌 규칙)
- 단계 / 청크는 `docs/07-roadmap.md` 기준에 맞추기
- 단위 완료마다 3줄 요약 (구현 / 확인 / 다음)

---

## 자주 하는 실수 (사전 차단)

- ❌ Next.js 15 또는 그 이하 패턴 (RSC·캐시 API 변경됨)
- ❌ Supabase RLS 무시한 직접 쿼리 — 권한 검증은 RLS + role 가드 둘 다
- ❌ 랜딩 repo (`frame-korea-landing`) 의존 import
- ❌ `.env.local` 커밋 (`.env.example`만)
