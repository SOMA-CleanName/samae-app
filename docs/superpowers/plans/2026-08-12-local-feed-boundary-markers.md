# Local Feed Boundary Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show persistent local-development markers at the end of normal photos and at the end of a complete home-feed cycle.

**Architecture:** Store marker positions separately from photo items so markers never enter recommendation, duplicate-ID, or click-history logic. A pure helper creates unique markers and splits photos into render segments; `ExploreGallery` persists markers in its existing session snapshot and renders a full-width divider between masonry segments.

**Tech Stack:** TypeScript, React, Next.js, Node test runner

## Global Constraints

- Render markers only when `process.env.NODE_ENV === "development"`.
- Show `일반 사진 끝 · 이제 노출 낮춤 사진이 이어집니다` when normal pages are exhausted.
- Show `전체 사진 끝 · 여기부터 사진이 반복됩니다` when demoted pages are exhausted.
- Keep marker positions across detail navigation through the existing feed session cache.
- Do not include markers in photo IDs, similarity ranking, seen-photo filtering, or click history.

---

### Task 1: Pure feed-boundary model

**Files:**
- Create: `src/lib/feed-boundary.ts`
- Create: `src/lib/feed-boundary.test.ts`

**Interfaces:**
- Produces: `FeedBoundary`, `addFeedBoundary(boundaries, boundary)`, and `splitAtFeedBoundaries(items, boundaries)`.

- [ ] **Step 1: Write failing tests** proving duplicate boundary IDs are ignored and item arrays split at the recorded item counts.
- [ ] **Step 2: Run** `node --experimental-strip-types --test src/lib/feed-boundary.test.ts` and verify failure because the module is missing.
- [ ] **Step 3: Implement** the boundary types, deduplication helper, and deterministic segment splitter without React dependencies.
- [ ] **Step 4: Re-run the test** and verify all boundary tests pass.

### Task 2: Home-feed integration

**Files:**
- Modify: `src/components/user/ExploreGallery.tsx`

**Interfaces:**
- Consumes: `FeedBoundary`, `addFeedBoundary`, and `splitAtFeedBoundaries` from Task 1.
- Produces: local-only, persistent full-width boundary dividers in the home feed.

- [ ] **Step 1: Extend `FeedSession`** with optional `boundaries` and restore/reset/persist that state alongside existing cycle state.
- [ ] **Step 2: Record a `normal-end` boundary** before switching normal to demoted, using the current total photo count.
- [ ] **Step 3: Record a `cycle-end` boundary** before switching demoted to the next normal cycle, using a stable ID containing its cycle number.
- [ ] **Step 4: Split the visible photo list** at boundary positions and render each masonry segment followed by its local-only divider copy.
- [ ] **Step 5: Run** the boundary tests, existing feed tests, `npx tsc --noEmit`, targeted ESLint, and `npm run build`.
- [ ] **Step 6: Commit** implementation and tests with `feat: 로컬 피드 끝 표시 추가`.

### Task 3: Short feed-debug cycle

**Files:**
- Modify: `src/app/(user)/page.tsx`
- Modify: `src/components/user/ExploreGallery.tsx`
- Modify: `src/lib/feed-boundary.ts`
- Modify: `src/lib/feed-boundary.test.ts`

**Interfaces:**
- Produces: `limitDebugFeedPage(phase, page, photos)` and the `feedDebug` gallery prop.

- [ ] **Step 1: Write failing tests** proving normal page 0 keeps 48 photos, demoted page 0 keeps 24 photos, and later pages are empty.
- [ ] **Step 2: Run the boundary test** and verify failure because `limitDebugFeedPage` is missing.
- [ ] **Step 3: Implement the pure limiter** and re-run the test to green.
- [ ] **Step 4: Parse `feedDebug=1`** only in development and pass it to `ExploreGallery`.
- [ ] **Step 5: Separate debug cache keys**, apply the limiter to phase requests, and render current phase, cycle, and loaded count.
- [ ] **Step 6: Run related tests, type checking, targeted ESLint, and the production build.**
- [ ] **Step 7: Commit** with `feat: 로컬 피드 단축 테스트 모드 추가`.
