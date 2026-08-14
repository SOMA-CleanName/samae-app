# 관심 사진 상세 세로 순환 탐색

> 설계 기준: 2026-08-14 · `dev` 브랜치

---

## 1. 목표와 범위

관심 사진 도크의 펼침 그리드에서 사진을 탭해 상세보기에 들어간 뒤, 세로 스와이프만으로 다른 관심 사진을 연속 탐색한다. 가로 스와이프는 탐색 동작으로 사용하지 않는다.

- 손가락을 위로 밀면 그리드 표시 순서의 다음 관심 사진으로 이동한다.
- 손가락을 아래로 끌면 이전 관심 사진으로 이동한다.
- 마지막 사진의 다음은 첫 사진이고, 첫 사진의 이전은 마지막 사진이다.
- 관심 사진이 한 장뿐이면 순환 탐색과 제스처 안내를 비활성화한다.
- 닫기, 공유, 게시물 보기, 무료 견적 받기와 기존 브라우저 뒤로가기 동작은 유지한다.

그리드는 최신 관심 사진부터 표시하므로 상세 탐색 순서도 같은 최신순을 사용한다. 사용자가 그리드 중간 사진에서 진입하면 그 위치를 기준으로 앞뒤가 이어진다.

## 2. 제스처 판정과 전환

- 포인터 시작점과 끝점의 세로 거리가 56px 이상이고 세로 이동이 가로 이동보다 클 때만 탐색으로 판정한다.
- 위 방향은 `next`, 아래 방향은 `previous`로 해석한다.
- 임계값 미만 이동과 가로 위주 이동은 사진 전환을 만들지 않는다.
- 한 번 전환을 시작하면 약 320ms 동안 중복 입력을 잠근다.
- 현재 사진은 제스처 방향으로 빠져나가고 새 사진은 반대쪽에서 들어오는 세로 전환을 사용한다.
- 전환이 시작된 포인터 업 뒤에 발생하는 합성 클릭은 무시해 상세보기가 그리드로 닫히지 않게 한다.
- 데스크톱 확인을 위해 세로 휠·트랙패드 입력도 같은 순환 인덱스를 사용하되 한 번의 관성 스크롤에서 한 장만 이동하도록 잠근다.
- `prefers-reduced-motion` 환경에서는 큰 이동 애니메이션 없이 짧은 교차 페이드로 바꾼다.

순환 인덱스 계산과 제스처 방향 판정은 React 컴포넌트 밖의 순수 함수로 분리해 경계 조건을 자동 테스트한다.

## 3. 최초 사용 안내

관심 사진이 두 장 이상이고 이 브라우저에서 안내를 본 적이 없을 때만 상세 진입 약 0.5초 후 안내를 한 번 표시한다.

```text
위로 밀면 다음 관심사진이 보입니다
```

- 회색 반투명 배경과 흰색 글씨를 사용한다.
- 문구 위의 하얀 화살표 세 개가 짧은 간격으로 위로 이동하며 사라진다.
- 안내 전체는 약 2초 안에 페이드아웃하고 포인터 입력을 가로채지 않는다.
- 사용자가 안내 도중 실제 스와이프를 시작하면 즉시 사라진다.
- 노출 여부는 버전이 포함된 `localStorage` 키로 저장한다. 문구나 동작을 크게 바꿀 때 새 버전으로 다시 안내할 수 있다.
- 저장소에 접근할 수 없으면 현재 상세 세션에서 한 번만 보여주고 탐색 자체는 정상 동작한다.

## 4. 상태와 데이터 흐름

1. `FloatingCart`는 `items`를 그리드 표시 순서와 같은 최신순 탐색 배열로 만든다.
2. 상세 진입 시 `focused` ID의 탐색 인덱스를 찾는다.
3. 스와이프 방향과 현재 인덱스로 순환 목적지 인덱스를 계산한다.
4. 전환 중에는 출발·도착 ID와 방향을 보관하고 두 카드만 표시한다.
5. 전환이 끝나면 `focused`를 목적지 ID로 확정하고 기존 메타 조회가 새 사진 ID 기준으로 실행된다.
6. 관심 목록이 외부에서 바뀌어 현재 ID가 사라지면 남은 첫 사진으로 이동하고, 목록이 비면 기존 동작대로 도크를 닫는다.

## 5. 실패 처리와 접근성

- 이미지나 메타 조회가 늦어도 사진 전환 상태는 멈추지 않는다. 기존 메타의 `photoId` 검증으로 다른 사진 정보가 노출되지 않게 한다.
- 전환 중 닫기나 브라우저 뒤로가기가 발생하면 타이머를 정리하고 그리드로 복귀한다.
- 안내는 `aria-hidden`으로 처리해 화면 낭독기가 일회성 장식 문구를 반복해서 읽지 않게 한다.
- 상세 카드 컨테이너의 접근성 라벨에는 세로 탐색 가능 여부를 포함한다.

## 6. 테스트와 승인 기준

1. 중간 사진에서 `next`와 `previous`가 각각 인접 사진을 반환한다.
2. 마지막의 `next`가 첫 사진, 첫 사진의 `previous`가 마지막 사진을 반환한다.
3. 빈 목록과 한 장 목록에서 안전하게 동작한다.
4. 56px 미만, 가로 위주 이동은 무시하고 유효한 위·아래 이동만 방향을 반환한다.
5. 스와이프 뒤 합성 클릭으로 상세가 닫히지 않는다.
6. 빠른 연속 입력과 휠 관성이 한 번의 전환에서 여러 장을 건너뛰지 않는다.
7. 최초 안내는 두 장 이상일 때 한 번만 나타나며 약 2초 안에 사라진다.
8. 실제 스와이프 시 안내가 즉시 사라진다.
9. 마지막과 처음 사이를 여러 번 왕복해도 공유·메타·CTA가 현재 사진 ID를 사용한다.

---

## 7. 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관심 사진 상세에서 세로 스와이프와 휠로 앞뒤 사진을 순환 탐색하고, 최초 진입에 제스처 안내 모션을 한 번 보여준다.

**Architecture:** 순환 인덱스와 제스처 방향 판정은 `cart-detail-navigation.ts`의 순수 함수로 분리한다. `FloatingCart`는 출발·도착 사진 두 장의 전환 상태만 관리하며 기존 카드·메타·CTA를 재사용한다. 안내 모션은 전역 CSS 키프레임과 버전이 포함된 로컬 저장소 키로 제어한다.

**Tech Stack:** TypeScript, React 19, Next.js 16, Tailwind CSS 4, Node test runner

### Global Constraints

- 탐색 입력은 세로 방향만 사용한다.
- 위로 밀면 다음, 아래로 끌면 이전 사진이다.
- 56px 미만 또는 가로 위주 이동은 무시한다.
- 마지막과 처음은 양방향으로 순환한다.
- 한 장일 때 탐색과 안내를 비활성화한다.
- 새 패키지는 추가하지 않는다.
- 삭제된 `docs/superpowers/plans`와 `docs/superpowers/specs` 폴더를 다시 만들지 않는다.

### Task 1: 순환 탐색과 제스처 판정

**Files:**

- Create: `src/lib/cart-detail-navigation.ts`
- Create: `src/lib/cart-detail-navigation.test.ts`

**Interfaces:**

- Produces: `type CartNavigationDirection = "next" | "previous"`
- Produces: `circularPhotoId(ids: string[], currentId: string, direction: CartNavigationDirection): string | null`
- Produces: `verticalSwipeDirection(startX: number, startY: number, endX: number, endY: number, threshold?: number): CartNavigationDirection | null`

- [ ] **Step 1: 순환 경계와 제스처 임계값 실패 테스트 작성**

```ts
test("next wraps from the last photo to the first", () => {
  assert.equal(circularPhotoId(["a", "b", "c"], "c", "next"), "a");
});

test("previous wraps from the first photo to the last", () => {
  assert.equal(circularPhotoId(["a", "b", "c"], "a", "previous"), "c");
});

test("vertical swipe accepts only dominant movement beyond 56px", () => {
  assert.equal(verticalSwipeDirection(10, 100, 18, 40), "next");
  assert.equal(verticalSwipeDirection(10, 40, 14, 100), "previous");
  assert.equal(verticalSwipeDirection(10, 100, 50, 60), null);
  assert.equal(verticalSwipeDirection(10, 100, 10, 45), null);
});
```

- [ ] **Step 2: 테스트가 모듈 부재로 실패하는지 확인**

Run: `node --experimental-strip-types --test src/lib/cart-detail-navigation.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `cart-detail-navigation.ts`.

- [ ] **Step 3: 최소 순수 함수 구현**

```ts
export type CartNavigationDirection = "next" | "previous";

export function circularPhotoId(ids: string[], currentId: string, direction: CartNavigationDirection) {
  if (ids.length < 2) return null;
  const index = ids.indexOf(currentId);
  if (index < 0) return ids[0] ?? null;
  const delta = direction === "next" ? 1 : -1;
  return ids[(index + delta + ids.length) % ids.length] ?? null;
}

export function verticalSwipeDirection(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  threshold = 56
): CartNavigationDirection | null {
  const dx = endX - startX;
  const dy = endY - startY;
  if (Math.abs(dy) < threshold || Math.abs(dy) <= Math.abs(dx)) return null;
  return dy < 0 ? "next" : "previous";
}
```

- [ ] **Step 4: 단위 테스트 통과 확인**

Run: `node --experimental-strip-types --test src/lib/cart-detail-navigation.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: 순수 함수와 테스트 커밋**

```bash
git add src/lib/cart-detail-navigation.ts src/lib/cart-detail-navigation.test.ts
git commit -m "feat: 관심 사진 순환 탐색 계산 추가"
```

### Task 2: 상세 카드 세로 전환 연결

**Files:**

- Modify: `src/components/user/cart/FloatingCart.tsx`
- Test: `src/lib/cart-detail-navigation.test.ts`

**Interfaces:**

- Consumes: `circularPhotoId`, `verticalSwipeDirection`, `CartNavigationDirection`
- Produces: 포인터·휠 입력으로 갱신되는 `focused` 사진 ID와 320ms 두 카드 전환

- [ ] **Step 1: 한 장·현재 ID 누락 동작 테스트를 먼저 추가**

```ts
test("navigation is disabled for fewer than two photos", () => {
  assert.equal(circularPhotoId([], "a", "next"), null);
  assert.equal(circularPhotoId(["a"], "a", "next"), null);
});

test("a missing current photo recovers to the first photo", () => {
  assert.equal(circularPhotoId(["a", "b"], "missing", "next"), "a");
});
```

- [ ] **Step 2: 변경 전 테스트가 기대 동작을 보호하는지 실행**

Run: `node --experimental-strip-types --test src/lib/cart-detail-navigation.test.ts`

Expected: tests PASS against Task 1 contract; changing the `< 2` or missing-ID branches makes them FAIL.

- [ ] **Step 3: `FloatingCart`에 최신순 탐색 배열과 전환 상태 연결**

```ts
type FocusTransition = {
  fromId: string;
  toId: string;
  direction: CartNavigationDirection;
  active: boolean;
};

const navigationIds = useMemo(() => items.map((item) => item.id).reverse(), [items]);
const [focusTransition, setFocusTransition] = useState<FocusTransition | null>(null);
```

`beginFocusTransition(direction)`은 전환 중이거나 사진이 두 장 미만이면 반환한다. 아니면 `circularPhotoId`로 목적지를 구해 다음 프레임에 `active: true`로 바꾸고 320ms 뒤 `focused=toId`, `focusTransition=null`을 적용한다. 닫기·언마운트 시 예약 프레임과 타이머를 정리한다.

- [ ] **Step 4: 포인터와 휠 입력 연결**

포커스 카드의 포인터 시작 좌표를 ref에 저장하고 포인터 업에서 `verticalSwipeDirection`을 호출한다. 유효한 스와이프 직후의 합성 클릭은 한 번만 무시한다. `wheel`은 `abs(deltaY) >= 20`일 때 방향을 결정하며 420ms 잠금으로 관성 이벤트가 여러 사진을 넘기지 않게 한다. 포커스 중 기존 롱프레스 타이머는 시작하지 않는다.

- [ ] **Step 5: 출발·도착 카드의 transform과 opacity 연결**

다음 이동은 출발 카드가 위로, 도착 카드가 아래에서 중앙으로 이동한다. 이전 이동은 반대다. 전환 중 두 카드만 보이고 포인터 입력을 받지 않는다. `prefers-reduced-motion`이면 위치 이동량을 0으로 두고 opacity만 바꾼다.

- [ ] **Step 6: 타입 검사와 대상 린트 실행**

Run: `npx tsc --noEmit`

Run: `npx eslint src/lib/cart-detail-navigation.ts src/lib/cart-detail-navigation.test.ts src/components/user/cart/FloatingCart.tsx`

Expected: exit 0.

- [ ] **Step 7: 세로 순환 전환 커밋**

```bash
git add src/components/user/cart/FloatingCart.tsx src/lib/cart-detail-navigation.ts src/lib/cart-detail-navigation.test.ts
git commit -m "feat: 관심 사진 상세 세로 순환 탐색"
```

### Task 3: 최초 1회 스와이프 안내 모션

**Files:**

- Modify: `src/components/user/cart/FloatingCart.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- Produces: `samae:cart-swipe-hint:v1` 로컬 저장소 키
- Produces: `cart-swipe-hint`, `cart-swipe-chevron` CSS 애니메이션 클래스

- [ ] **Step 1: 안내 노출 상태를 상세 진입과 연결**

사진이 두 장 이상이고 저장소 키가 없을 때 상세 진입 500ms 뒤 `showSwipeHint=true`로 바꾸고 키를 저장한다. 2초 뒤 상태를 지운다. 저장소 접근이 실패하면 ref로 현재 페이지에서 중복 노출을 막는다. 포인터 다운·휠·닫기 시 타이머와 안내를 즉시 정리한다.

- [ ] **Step 2: 승인된 문구와 장식 마크업 추가**

```tsx
<div aria-hidden className="cart-swipe-hint pointer-events-none fixed ...">
  <div className="relative h-12 w-7">
    {[0, 1, 2].map((index) => (
      <svg key={index} className="cart-swipe-chevron absolute ..." style={{ animationDelay: `${index * 120}ms` }}>
        <path d="M5 15l7-7 7 7" />
      </svg>
    ))}
  </div>
  <p className="rounded-xl bg-[#5c5c5c]/90 px-4 py-2.5 text-sm font-semibold text-white">
    위로 밀면 다음 관심사진이 보입니다
  </p>
</div>
```

- [ ] **Step 3: 진입·화살표·퇴장 키프레임 추가**

`cart-swipe-hint`는 0.5초 지연 뒤 나타나 약 2초 안에 위로 8px 이동하며 사라진다. 세 개의 `cart-swipe-chevron`은 120ms 간격으로 아래에서 위로 이동하며 페이드아웃한다. `prefers-reduced-motion: reduce`에서는 위치 이동을 제거하고 안내의 교차 페이드만 유지한다.

- [ ] **Step 4: 대상 검사 실행**

Run: `npx tsc --noEmit`

Run: `npx eslint src/components/user/cart/FloatingCart.tsx`

Expected: exit 0.

- [ ] **Step 5: 안내 모션 커밋**

```bash
git add src/components/user/cart/FloatingCart.tsx src/app/globals.css
git commit -m "feat: 관심 사진 세로 탐색 안내 추가"
```

### Task 4: 렌더링 및 회귀 검증

**Files:**

- Modify: `docs/25-interest-photo-vertical-loop.md`

- [ ] **Step 1: 전체 관련 테스트 실행**

Run:

```bash
node --experimental-strip-types --test \
  src/lib/cart-detail-navigation.test.ts \
  src/lib/feed-personalization.test.ts \
  src/lib/feed-click-history.test.ts \
  src/lib/feed-demotion.test.ts
```

Expected: all tests PASS.

- [ ] **Step 2: 타입과 린트 실행**

Run: `npx tsc --noEmit`

Run: `npx eslint src/lib/cart-detail-navigation.ts src/lib/cart-detail-navigation.test.ts src/components/user/cart/FloatingCart.tsx`

Expected: exit 0.

- [ ] **Step 3: 로컬 3000에서 실제 상호작용 검증**

관심 사진을 두 장 이상 담은 뒤 도크 열기 → 중간 사진 탭 → 위로 스와이프 → 다음 사진 ID·메타·CTA 변경 → 아래로 스와이프 → 이전 사진 복귀 → 마지막에서 위로 스와이프해 첫 사진 노출을 확인한다. 안내 바·화살표가 최초 한 번 나타났다가 사라지고 스와이프 시작 시 즉시 사라지는지 확인한다. 데스크톱 휠 관성도 한 장만 이동하는지 확인한다.

- [ ] **Step 4: 문서에 실제 검증 결과 기록**

테스트 개수, 타입·린트 결과, 확인한 뷰포트와 남은 위험을 이 문서 끝에 기록한다.

- [ ] **Step 5: 검증 기록 커밋**

```bash
git add docs/25-interest-photo-vertical-loop.md
git commit -m "docs: 관심 사진 세로 탐색 검증 기록"
```
