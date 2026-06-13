# 14. 디자인 시스템

사매 UI/UX 전면 재단장의 **기반 레이어**. 모든 페이지는 이 토큰·프리미티브 위에서 만든다.
값(`#fff`, `text-gray-400`, 임의 px)을 직접 박지 말고 **토큰/프리미티브**를 쓴다.

> 관련: [11 유저 플로우](11-user-flows.md) · [12 UX 검토](12-ux-review.md)

---

## 0. 원칙

- **페이지 단위**로 재디자인하며, 각 페이지는 **모바일(375px) + PC(1440px)** 두 화면을 모두 검토한다.
- 반응형 기준 브레이크포인트: `375 / 768(md) / 1024(lg) / 1440`.
- 셸 구조는 핀터레스트식: **데스크톱 = 좌측 아이콘 레일(72px)**, **모바일 = 하단 탭바**. (`src/app/(user)/layout.tsx`)

---

## 1. 토큰 (`src/app/globals.css`)

### 컬러 — 의미로 쓴다

| 토큰 (Tailwind) | 값 | 용도 |
|---|---|---|
| `bg-bg` | `#fafafa` | 페이지 배경 |
| `text-fg` | `#0f0e0c` | 본문 잉크 |
| `bg-brand` / `text-brand` | `#ff3d2e` | 시그니처. **전환 CTA·강조·배지** |
| `bg-brand-soft` `text-brand-ink` | 틴트/진한 | 브랜드 배경·그 위 텍스트 |
| `bg-surface` | `#fff` | 카드·모달 표면 |
| `bg-surface-2` | `#f4f2ef` | 보조 표면·hover |
| `border-line` / `border-line-strong` | `#e7e5e1` / `#d6d3ce` | 경계선 |
| `text-muted` | `#57534e` | 보조 텍스트(대비 4.5:1 ✓) |
| `text-faint` | `#8a857d` | 플레이스홀더·비활성 |
| `*-success / warning / danger / info` | — | 상태 (각 `-soft` 배경 쌍) |

> ⚠️ 기존 코드의 `text-fg/55` 류 반투명 회색은 대비 미달 위험. 신규/수정 시 **보조 텍스트는 `text-muted`** 로.

### 반경 · 그림자 · z-index

- 반경: 칩 `rounded-lg` · 버튼/인풋 `rounded-xl` · 카드 `rounded-2xl` · 시트/모달 `rounded-3xl`
- 그림자: `shadow-card`(카드) · `shadow-pop`(드롭다운·팝오버)
- z-index: 헤더 30 · 레일/탭바 40 · 드롭다운 50 · 모달 60 · 토스트 70

### 폰트

- `font-display` = Fraunces (italic, 히어로/로고 `samae`)
- 본문 = Inter + Noto Sans KR (자동), 한글 영역은 `font-kr`
- 본문 최소 16px, 줄높이 1.5–1.75, 한글 `word-break: keep-all` (전역 적용됨)

### 접근성 기본값 (전역 자동)

- `:focus-visible` 브랜드 아웃라인 — 키보드 탐색만
- `prefers-reduced-motion` 존중 — 애니메이션 정지
- `::selection` 브랜드 틴트

### 유틸

- `.scrollbar-none` · `.clamp-2/3` · `.pb-safe/.pt-safe`(앱 노치/홈바 안전영역)

---

## 2. 프리미티브 (`src/components/ui/`)

`import { Button, Card, ... } from "@/components/ui"`

| 컴포넌트 | 핵심 props | 비고 |
|---|---|---|
| `Button` | `variant`(primary·brand·secondary·ghost·danger) · `size`(sm·md·lg) · `loading` · `href` · `fullWidth` · `leftIcon` | `href` 주면 `<Link>`. md/lg = 44px 터치타겟 |
| `Input` / `Textarea` | `invalid` · `leftIcon` | 44px 높이, focus ring 내장 |
| `Field` | `label` · `hint` · `error` · `required` | 라벨+에러 래퍼 |
| `Card` | `href` · `interactive` | href/interactive 시 hover·cursor·focus |
| `Badge` | `tone`(neutral·brand·success·warning·danger·info) | 예약 단계 등 상태 |
| `Chip` | `selected` | 필터·태그(가로 스크롤) |
| `Avatar` | `src` · `name` · `size`(sm·md·lg·xl) | 이니셜 폴백 |
| `EmptyState` | `icon` · `title` · `description` · `action` | 빈 목록 |
| `Skeleton` | `className` | 로딩 자리표시 |
| `Spinner` | `className` | 인라인 로딩 |

`cn()` 결합기: `src/lib/cn.ts`.

---

## 3. 아이콘

**이모지 금지**(📍⭐✅ 등) → `src/components/user/icons.tsx`의 SVG 사용.
공통: `StarIcon` · `MapPinIcon` · `CheckIcon` · 네비 아이콘 일습. 24px viewBox, `currentColor` 상속.

---

## 4. 페이지 작업 체크리스트

각 페이지 재디자인 완료 전 확인:

- [ ] 모바일(375) / PC(1440) 두 화면 모두 점검
- [ ] 가로 스크롤 없음, 콘텐츠가 고정 헤더/탭바에 가려지지 않음
- [ ] 클릭 요소 `cursor-pointer` + hover 피드백, 터치 타겟 ≥ 44px
- [ ] 이모지 아이콘 없음, 색만으로 의미 전달 안 함
- [ ] 보조 텍스트 `text-muted` 이상 대비, 라벨-인풋 연결
- [ ] 비동기: 로딩(Spinner/Skeleton)·빈 상태(EmptyState)·에러 처리
- [ ] 토큰/프리미티브 사용 (인라인 복붙 금지)
