# 관심사진 기반 유사사진 진입 및 탐색 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관심사진이 4장 이상일 때 기존 관심사진 화면 오른쪽에 3초 뒤 아이콘으로 접히는 유사사진 진입 버튼을 표시하고, 현재 관심사진 기반 추천을 같은 폴라로이드 레이아웃에서 탐색하게 한다.

**Architecture:** 추천 가능 여부·요청 키·서버 응답 카드 변환은 순수 함수로 분리하고, 기존 개인화 추천 서버 로직은 관심사진 전용 서버 액션에서 재사용한다. `FloatingCart`는 관심사진과 추천사진 배열을 분리한 채 현재 화면에 사용할 배열만 기존 메이슨리 배치 계산에 전달하며, 추천 카드는 일반 사진 상세 페이지로 이동한다.

**Tech Stack:** Next.js 16 Server Actions, React 19, TypeScript, Tailwind CSS, Node test runner, Supabase 기반 기존 추천 함수

## Global Constraints

- 현재 관심사진이 4장 이상일 때만 진입 버튼을 표시한다.
- 표시 문구는 `관심사진과 비슷한 사진 보기`이며 `취향 기반 추천`은 렌더링하지 않는다.
- 전체 문구는 약 3초 뒤 오른쪽으로 접히고 최소 44px 추천 아이콘만 남는다.
- 선택 모드와 개별 관심사진 확대 상태에서는 진입 버튼을 숨긴다.
- 추천 앵커는 현재 관심사진만 사용하고 최근 4개를 우선한다.
- 현재 관심사진과 중복 추천은 결과에서 제외하고 최대 36장을 표시한다.
- 관심사진 4장의 목표 추천량은 기존 가중치에 따라 27장이다.
- 관심사진과 추천사진을 같은 화면에 섞지 않는다.
- 기존 관심사진 카드 배치·상세 순환·삭제·공유 동작을 변경하지 않는다.

---

## File Structure

- Create `src/lib/interest-similar-recommendations.ts`: 노출 임계값, 요청 키, 추천 응답 카드 변환 순수 함수
- Create `src/lib/interest-similar-recommendations.test.ts`: 임계값·키·중복 제거·카드 변환 테스트
- Create `src/components/user/cart/InterestSimilarEntry.tsx`: 펼침/접힘/로딩 상태만 표현하는 오른쪽 진입 버튼
- Modify `src/app/(user)/feed-actions.ts`: 관심사진 전용 추천 서버 액션
- Modify `src/components/user/cart/FloatingCart.tsx`: 추천 조회 상태, 화면 전환, 뒤로가기, 기존 카드 레이아웃 재사용
- Modify `docs/26-interest-similar-recommendations.md`: 구현 결과와 검증 기록

---

### Task 1: 관심사진 추천 순수 로직

**Files:**
- Create: `src/lib/interest-similar-recommendations.ts`
- Create: `src/lib/interest-similar-recommendations.test.ts`

**Interfaces:**
- Produces: `canOpenInterestRecommendations(ids: string[]): boolean`
- Produces: `interestRecommendationRequestKey(ids: string[]): string`
- Produces: `toInterestRecommendationCards(photos: InterestRecommendationPhoto[]): InterestRecommendationCard[]`
- Produces: `INTEREST_RECOMMENDATION_MIN_COUNT = 4`
- Produces: `INTEREST_RECOMMENDATION_COLLAPSE_MS = 3000`

- [ ] **Step 1: Write the failing tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  canOpenInterestRecommendations,
  interestRecommendationRequestKey,
  toInterestRecommendationCards,
} from "./interest-similar-recommendations.ts";
import { personalizedRecommendationTarget } from "./feed-personalization.ts";

test("recommendations open from four current interest photos", () => {
  assert.equal(canOpenInterestRecommendations(["a", "b", "c"]), false);
  assert.equal(canOpenInterestRecommendations(["a", "b", "c", "d"]), true);
  assert.equal(canOpenInterestRecommendations(["a", "a", "b", "c", "d"]), true);
});

test("request key preserves interest order while removing duplicate ids", () => {
  assert.equal(interestRecommendationRequestKey(["old", "new", "old"]), "old|new");
});

test("four interests request 27 recommendations within the 36 maximum", () => {
  assert.equal(personalizedRecommendationTarget([], ["a", "b", "c", "d"], 36), 27);
});

test("server photos become unique cart-shaped recommendation cards", () => {
  assert.deepEqual(
    toInterestRecommendationCards([
      { id: "a", src_url: "full-a", thumb_url: "thumb-a", width: 100, height: 200 },
      { id: "a", src_url: "duplicate", thumb_url: null, width: 1, height: 1 },
      { id: "b", src_url: "full-b", thumb_url: null, width: 300, height: 200 },
    ]),
    [
      { id: "a", src: "thumb-a", w: 100, h: 200, seq: 0 },
      { id: "b", src: "full-b", w: 300, h: 200, seq: 1 },
    ]
  );
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `node --test src/lib/interest-similar-recommendations.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `interest-similar-recommendations.ts`.

- [ ] **Step 3: Implement the pure helpers**

```ts
export const INTEREST_RECOMMENDATION_MIN_COUNT = 4;
export const INTEREST_RECOMMENDATION_COLLAPSE_MS = 3_000;

export type InterestRecommendationPhoto = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  width: number;
  height: number;
};

export type InterestRecommendationCard = {
  id: string;
  src: string;
  w: number;
  h: number;
  seq: number;
};

function uniqueIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

export function canOpenInterestRecommendations(ids: string[]) {
  return uniqueIds(ids).length >= INTEREST_RECOMMENDATION_MIN_COUNT;
}

export function interestRecommendationRequestKey(ids: string[]) {
  return uniqueIds(ids).join("|");
}

export function toInterestRecommendationCards(photos: InterestRecommendationPhoto[]) {
  const seen = new Set<string>();
  return photos.flatMap((photo) => {
    if (!photo.id || seen.has(photo.id)) return [];
    seen.add(photo.id);
    return [{
      id: photo.id,
      src: photo.thumb_url ?? photo.src_url,
      w: photo.width,
      h: photo.height,
      seq: seen.size - 1,
    }];
  });
}
```

- [ ] **Step 4: Run the focused and related recommendation tests**

Run: `node --test src/lib/interest-similar-recommendations.test.ts src/lib/feed-personalization.test.ts`

Expected: PASS, including the existing four-interest target of 27 and maximum 36 behavior.

- [ ] **Step 5: Commit the pure logic**

```bash
git add src/lib/interest-similar-recommendations.ts src/lib/interest-similar-recommendations.test.ts
git commit -m "feat: 관심사진 추천 진입 계산 추가"
```

---

### Task 2: 관심사진 전용 추천 서버 액션

**Files:**
- Modify: `src/app/(user)/feed-actions.ts`

**Interfaces:**
- Consumes: `fetchPersonalizedRecommendations(clickedIds, interestedIds, excludedIds, maxLimit)`
- Produces: `loadInterestSimilarPhotos(interestPhotoIds: string[]): Promise<GalleryPhoto[]>`

- [ ] **Step 1: Add the server action with strict input normalization**

```ts
export async function loadInterestSimilarPhotos(
  interestPhotoIds: string[]
): Promise<GalleryPhoto[]> {
  const currentInterestIds = [...new Set(interestPhotoIds.filter(Boolean))];
  if (currentInterestIds.length < 4) return [];
  return fetchPersonalizedRecommendations([], currentInterestIds, currentInterestIds, 36);
}
```

The action intentionally passes an empty clicked-photo list. Current interest IDs serve as both the recommendation signal and exclusion list.

- [ ] **Step 2: Run the recommendation unit tests and type checker**

Run: `node --test src/lib/feed-personalization.test.ts src/lib/interest-similar-recommendations.test.ts`

Run: `npx tsc --noEmit`

Expected: both commands PASS.

- [ ] **Step 3: Commit the server boundary**

```bash
git add 'src/app/(user)/feed-actions.ts'
git commit -m "feat: 관심사진 기반 추천 조회 추가"
```

---

### Task 3: 접히는 오른쪽 추천 진입 버튼

**Files:**
- Create: `src/components/user/cart/InterestSimilarEntry.tsx`
- Modify: `src/components/user/cart/FloatingCart.tsx`

**Interfaces:**
- Consumes: `collapsed: boolean`, `loading: boolean`, `onClick(): void`
- Produces: 접근성 이름이 `관심사진과 비슷한 사진 보기`인 최소 44px 버튼

- [ ] **Step 1: Implement the presentational entry component**

```tsx
type InterestSimilarEntryProps = {
  collapsed: boolean;
  loading: boolean;
  onClick: () => void;
};

export function InterestSimilarEntry({ collapsed, loading, onClick }: InterestSimilarEntryProps) {
  return (
    <button
      type="button"
      aria-label="관심사진과 비슷한 사진 보기"
      aria-busy={loading}
      onClick={onClick}
      className={`fixed right-0 top-[38%] z-[63] flex h-14 items-center overflow-hidden rounded-l-2xl border border-r-0 border-white/20 bg-black/90 text-white shadow-pop backdrop-blur-md transition-[width] duration-300 motion-reduce:transition-none ${collapsed ? "w-14" : "w-48"}`}
    >
      <span className="ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand" aria-hidden>
        {loading ? "…" : "✦"}
      </span>
      <span className={`ml-2 whitespace-nowrap text-left text-xs font-bold leading-snug transition-opacity duration-150 motion-reduce:transition-none ${collapsed ? "opacity-0" : "opacity-100"}`}>
        관심사진과<br />비슷한 사진 보기
      </span>
      <span className={`ml-auto mr-3 transition-opacity ${collapsed ? "opacity-0" : "opacity-100"}`} aria-hidden>›</span>
    </button>
  );
}
```

Do not add the removed `취향 기반 추천` copy anywhere in the component.

- [ ] **Step 2: Add timer lifecycle to `FloatingCart`**

Add `recommendationEntryCollapsed` state and one timer ref. In `startOpen`, reset the expanded state and schedule collapse after `INTEREST_RECOMMENDATION_COLLAPSE_MS` when the current unique item count is at least four. Clear the timer in `close` and unmount cleanup. Render `InterestSimilarEntry` only when:

```ts
phase === "spread" &&
canOpenInterestRecommendations(items.map((item) => item.id)) &&
!focused &&
!selectMode &&
!similarMode
```

Track entry exposure once in `startOpen` and click in the button handler with the current interest count.

- [ ] **Step 3: Verify lint and removed copy**

Run: `npx eslint src/components/user/cart/InterestSimilarEntry.tsx src/lib/interest-similar-recommendations.ts src/lib/interest-similar-recommendations.test.ts`

Run: `rg -n "취향 기반 추천" src/components/user/cart/InterestSimilarEntry.tsx src/components/user/cart/FloatingCart.tsx`

Expected: ESLint PASS and `rg` returns no matches.

- [ ] **Step 4: Commit the entry UI**

```bash
git add src/components/user/cart/InterestSimilarEntry.tsx src/components/user/cart/FloatingCart.tsx
git commit -m "feat: 관심사진 추천 진입 버튼 추가"
```

---

### Task 4: 추천 화면 전환과 기존 폴라로이드 레이아웃 재사용

**Files:**
- Modify: `src/components/user/cart/FloatingCart.tsx`
- Modify: `src/lib/interest-similar-recommendations.test.ts`

**Interfaces:**
- Consumes: `loadInterestSimilarPhotos(ids)` and `toInterestRecommendationCards(photos)`
- Produces: `idle | loading | ready | error` request state and `similarMode: boolean`

- [ ] **Step 1: Add request state and stale-response protection**

Store the request key with the result:

```ts
type SimilarRequestState =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; items: CartItem[] }
  | { status: "error"; key: string };
```

Before applying an async response, compare its key with a ref holding the latest current-interest key. If the key changed, ignore the stale response. Reuse a `ready` result with the same key during the same open overlay. Reset request state in `close`.

- [ ] **Step 2: Reuse the layout with a separate display array**

Keep `N = count` for dock lifecycle and existing interest header. Add:

```ts
const recommendationItems = similarState.status === "ready" ? similarState.items : [];
const displayItems = similarMode ? recommendationItems : items;
const displayCount = displayItems.length;
```

Change only the spread layout calculation from `items`/`N` to `displayItems`/`displayCount`. Dock FLIP and storage logic must continue using `items`/`count`. Disable long press, selection, remove and focus-detail behavior in recommendation mode. Clicking a recommendation card records `Click Similar Interest Photo`, closes the overlay state, and routes to `/photos/{id}`.

- [ ] **Step 3: Add recommendation header and history depth**

- In recommendation mode, render `비슷한 사진` and its returned count in the existing centered header position.
- Hide the right-side `선택` button.
- Make the left back button exit recommendation mode without closing the interest overlay.
- Include `similarMode` in navigation depth 2. A browser back event exits recommendation mode before closing the cart.
- Empty space continues to close the whole overlay, matching the existing interest screen behavior.

- [ ] **Step 4: Add loading, empty and error states**

- While loading, keep the interest cards visible and show loading feedback inside the entry icon.
- On error, keep the interest screen visible and show `비슷한 사진을 불러오지 못했어요` with an accessible retry button.
- For a successful empty response, switch to the recommendation header and show `아직 보여드릴 비슷한 사진이 없어요` plus `관심사진으로 돌아가기`.
- When `displayCount > 0`, render the existing cards without an additional grid or section.

- [ ] **Step 5: Run focused checks**

Run: `node --test src/lib/interest-similar-recommendations.test.ts src/lib/feed-personalization.test.ts src/lib/cart-detail-navigation.test.ts`

Run: `npx tsc --noEmit`

Run: `npx eslint src/components/user/cart/InterestSimilarEntry.tsx src/lib/interest-similar-recommendations.ts src/lib/interest-similar-recommendations.test.ts 'src/app/(user)/feed-actions.ts'`

Expected: all commands PASS. `FloatingCart.tsx` is validated by type checking and diff inspection because the file already contains repository-wide hook lint findings outside this feature.

- [ ] **Step 6: Commit recommendation navigation**

```bash
git add src/components/user/cart/FloatingCart.tsx src/lib/interest-similar-recommendations.test.ts
git commit -m "feat: 관심사진 유사 추천 화면 연결"
```

---

### Task 5: Regression verification and documentation

**Files:**
- Modify: `docs/26-interest-similar-recommendations.md`

**Interfaces:**
- Consumes: completed feature behavior and verification results
- Produces: reproducible implementation record in document 26

- [ ] **Step 1: Run automated verification**

Run: `node --test src/lib/*.test.ts`

Run: `npx tsc --noEmit`

Run: `git diff --check HEAD~4..HEAD`

Expected: all unit tests and type checking PASS with no whitespace errors.

- [ ] **Step 2: Verify on local port 3000**

1. Reset the local cart and add three photos: no recommendation entry appears.
2. Add the fourth distinct photo and open the cart: the full entry copy appears.
3. Wait about three seconds: the panel folds right and leaves a tappable icon.
4. Confirm `취향 기반 추천` is absent.
5. Tap the icon: the header becomes `비슷한 사진`, current interest photos are absent, and recommendation cards use the existing polaroid layout.
6. Use the header back button and browser back: each returns to the unchanged interest-photo spread.
7. Tap a recommendation card: `/photos/{id}` opens.
8. Check selection mode and an individual interest detail: the recommendation entry is hidden.

- [ ] **Step 3: Record results in document 26**

Append an implementation section listing modified files, the exact automated command results, local test observations, and any pre-existing repository lint findings. Do not add temporary visual-debug controls.

- [ ] **Step 4: Commit verification documentation**

```bash
git add docs/26-interest-similar-recommendations.md
git commit -m "docs: 관심사진 유사 추천 검증 기록"
```
