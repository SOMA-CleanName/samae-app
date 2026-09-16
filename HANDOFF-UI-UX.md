# 사매 UI/UX 작업 — 인계 노트 (2026-09-11)

이 워크트리는 **UI/UX 전용**이다. 사업자·세무·카카오 신청 같은 운영 작업은 여기서 하지 않는다
(그쪽은 `~/Documents/git/samae-app` 계열에서 따로 돈다).

```
브랜치   qa/ui-ux-0911   (origin 에 푸시됨)
기반     dev = main = e06e520
서버     npm run dev -- -p 3000
```

---

## 이미 끝난 것 — 7개 기능 브랜치 · 12 커밋

각 기능은 브랜치를 따로 파서 단위 커밋 후 `qa/ui-ux-0911` 로 머지했다. 같은 방식을 이어갈 것.

| 브랜치 | 내용 |
|---|---|
| `feat/reachable-footer` | 무한 피드를 3회에서 끊고 [사진 더 보기] + 푸터 복원. 밑단 trim·페이드. 피드 중간 링크 줄 제거 |
| `fix/masonry-resize` | ↑의 회귀 수정 — 유한 목록(`/c/[slug]`)에 헛된 버튼·452px 빈칸이 생기던 것 + 리사이즈로 낡던 trim |
| `fix/semantic-ink-tokens` | `bg-*-soft` 위 채움색 31곳 → `-ink`. Badge 프리미티브 포함 |
| `fix/touch-targets` | 캐러셀 도트 6×6 → 32×44, 작가 내비 32~36 → 44 |
| `fix/home-skeleton` | `HomeSkeleton` 신설 — 층 순서를 실제 홈에 맞춤 |
| `feat/kakao-avatar` | 로그인마다 카카오 프로필 사진 백필. `removeAvatar` 가 null 대신 `""` 를 씀 |
| `fix/nav-scroll-top` | 하단 탭 이동 시 최상단. `lib/nav-fresh.ts` 의 표식으로 ScrollMemory 복원을 이번 한 번만 건너뜀 |
| `fix/feed-loading-and-carousel` | 등장 연출 `rootMargin` `-8%` → `6%` + 마운트/스크롤 sweep. 배너 무한 루프 |

---

## 🔴 남은 것

### 1. 육안 확인 2개 (코드는 들어갔고 눈으로 봐야 함)

- **배너 무한 루프** — 마지막 → 처음이 오른쪽으로 이어지는지, 스냅이 안 보이는지
- **리사이즈 trim 추종** — 홈에서 창 폭을 바꿔 가며 빈칸·잘림이 없는지

### 2. 🔎 따로 파야 할 것

측정 중 `/c/couple` 에서 **그리드 컨테이너 자체가 `opacity:0`** 인 순간을 봤다
(`columnsReady && feedSessionReady` 가 false). 카드가 아니라 **지면 전체가 비는 경로**가
따로 있다는 뜻. 재현이 불안정해 손대지 않았다.

### 3. D1~D3 — 디자인 판단 필요 (정훈 방향 대기)

| | 정훈 지적 | 메모 |
|---|---|---|
| D1 | 헤더 브랜드·프로필·검색창 얼라인 | 제안: **브랜드—검색—프로필 한 줄**. 지금은 검색이 아래 전폭이라 세로 낭비 |
| D2 | 데스크톱 바로가기 좌측 몰림 | D3 과 묶어서 |
| D3 | 무드로 보기 빽빽함 · 텍스트 `…` · 대표 이미지 부족 | 정훈 제안: 데스크톱에서 **바로가기(좌) + 무드(우)** |
| — | 데스크톱에서도 FloatingNav 가 하단 중앙에 떠 콘텐츠를 가림 | 위 셋과 같은 개편에 묶는 게 효율적 |

**"대표 이미지 자체가 무드를 표현함에 부족"** 은 이미지 교체 얘기라 개발이 정할 수 없다.

### 4. 남은 대비 위반

`bg-*-soft` 위 위반은 0 이지만, **10~12px 에 `--faint`** 를 쓴 조합이 아직 50건대로 남아 있다.

```
3.95:1  10~12px + --faint   /explore · /guide · /articles · /admin
3.54:1  18px "₩0"           /studio/settlements   ← 금액이 흐리다
2.33:1  12px "수락"          /admin/transactions   ← 액션 버튼
```

제안 규칙: **10px 이하는 `--muted` 이상만.**

### 5. 미측정 화면

`/bookings` 계열 · `/spots` · `/explore/quiz` · `/inquiry/cart` · `/event/persona` · 대부분의 `/admin`

---

## ⚠️ 측정할 때 주의 (오탐 낸 이력)

- **`getBoundingClientRect()` 는 `::before` 확장을 못 본다.** 터치타겟은
  `getComputedStyle(el,'::before')` 를 더해서 재라. (`관심 추가 24px` 를 CRITICAL 로
  올렸다가 취소한 적 있음 — 이미 44px 확보돼 있었다)
- **대비 계산에서 alpha 를 합성해야 한다.** 반투명 배경(`bg-white/10`)을 불투명으로 보면
  1.00:1 같은 헛것이 나온다.
- **배경이 이미지·그라디언트인 텍스트**는 자동 측정으로 판정 불가.
- `a.block` 류의 `aria-hidden` 오버레이 링크는 **정석 패턴**이다. 이름 없다고 잡지 말 것.
- 브라우저 자동화가 **탭 이동을 자주 놓친다.** 측정 JS 안에서 `location.pathname` 을 같이
  찍어 어느 지면을 쟀는지 확인할 것. (엉뚱한 페이지를 재고 결론 낸 적 있음)

---

## 관련 문서

- `docs/23-inquiry-chat-system.md` — 채팅·봇·예약·정산의 진실
- `docs/14` 계열 — 디자인 시스템
- `src/app/globals.css` — 토큰. `-soft`(틴트) / `-ink`(틴트 위 글자) 규칙이 여기 있다
