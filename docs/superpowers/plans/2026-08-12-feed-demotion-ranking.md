# Feed Demotion Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace complete feed exclusion with a soft `노출 낮춤` policy that places demoted photos last by default and progressively restores strongly matching photos when the user repeatedly selects one style.

**Architecture:** Keep the existing `photos.feed_hidden` storage for compatibility, but expose it as `demoted` in application types. A pure ranking module owns promotion stages and merging, while Supabase queries return normal and demoted candidates separately. Home and detail views share one session click-history helper so both surfaces contribute to the same recent eight anchors.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/Postgres RPC, Node 26 built-in test runner.

## Global Constraints

- Keep the existing `photos.feed_hidden` column and all existing selected rows.
- Change user-facing admin copy from `숨김` to `노출 낮춤`.
- Apply soft demotion only to the basic home feed, home personalization, and photo-detail recommendations.
- Keep demoted photos excluded from search and editorial Explore surfaces.
- Remove duplicates only within the current 48-photo batch and current repeat cycle; allow prior-cycle photos to reappear in a new cycle.
- Store at most eight unique recent photo clicks shared by home and detail recommendations.
- Add no new npm dependencies.

---

### Task 1: Pure demotion ranking policy

**Files:**
- Create: `src/lib/feed-demotion.ts`
- Create: `src/lib/feed-demotion.test.ts`

**Interfaces:**
- Produces: `DemotionCandidate`, `promotionStage(anchorCount, styleConsistency)`, `mergeDemotedSimilar(normal, demoted, stage)`, and `uniqueWithinCycle(candidates, excludedIds, limit)`.

- [ ] **Step 1: Write failing Node tests** covering one-click placement after normal similarity, two-click lower-quartile promotion, three-click midpoint promotion, four-click near-natural-rank promotion, inconsistent-click non-promotion, and duplicate removal.
- [ ] **Step 2: Run `node --test src/lib/feed-demotion.test.ts`** and verify failure because `feed-demotion.ts` does not exist.
- [ ] **Step 3: Implement the minimal pure functions** using deterministic insertion indices: stage 1 at end, stage 2 at 75%, stage 3 at 50%, stage 4 by each candidate's natural rank.
- [ ] **Step 4: Run `node --test src/lib/feed-demotion.test.ts`** and verify all ranking tests pass.
- [ ] **Step 5: Commit** `src/lib/feed-demotion.ts` and its test with message `feat: 노출 낮춤 순위 정책 추가`.

### Task 2: Supabase similarity candidates include demotion state

**Files:**
- Create: `supabase/migrations/0076_photo_feed_demotion.sql`
- Modify: `src/lib/discovery.ts`

**Interfaces:**
- Consumes: ranking functions from Task 1.
- Produces: `SimilarPhoto` with `demoted: boolean`; `fetchSimilarPhotos()` returns both normal and demoted results in similarity order; `fetchRankedSimilarPhotos(opts, clickedPhotoIds)` returns the three-section detail ordering.

- [ ] **Step 1: Extend the ranking test** with an input mirroring RPC rows and assert `feed_hidden=true` maps to `demoted=true`; run it and verify the missing mapper fails.
- [ ] **Step 2: Add migration `0076`** replacing `similar_photos_by_embedding` so it returns `feed_hidden boolean` and no longer filters `not p.feed_hidden`, while preserving published, approved, current-photo, and same-album exclusions.
- [ ] **Step 3: Update tag fallback** to fetch both states, map `feed_hidden` to `demoted`, and preserve score/album ordering.
- [ ] **Step 4: Add ranked similarity composition** that calculates overlap, selects the promotion stage, orders normal and demoted similar candidates, and returns normal-similar → promoted/demoted-similar; unrelated seeded photos remain a client-side tail.
- [ ] **Step 5: Run** `node --test src/lib/feed-demotion.test.ts`, `npx tsc --noEmit`, and `git diff --check`.
- [ ] **Step 6: Commit** with message `feat: 유사 추천에 노출 낮춤 후보 포함`.

### Task 3: Shared home/detail click history

**Files:**
- Create: `src/lib/feed-click-history.ts`
- Create: `src/lib/feed-click-history.test.ts`
- Modify: `src/components/user/ExploreGallery.tsx`
- Modify: `src/app/(user)/photos/[id]/PhotoExplore.tsx`

**Interfaces:**
- Produces: `FEED_CLICK_HISTORY_KEY`, `appendFeedClick(ids, photoId, max=8)`, `readFeedClicks()`, and `recordFeedClick(photoId)`.
- Home and detail consumers both call `recordFeedClick` synchronously before navigation.

- [ ] **Step 1: Write failing tests** proving uniqueness, last-eight truncation, and stable ordering.
- [ ] **Step 2: Run `node --test src/lib/feed-click-history.test.ts`** and verify missing implementation failure.
- [ ] **Step 3: Implement pure append logic and guarded sessionStorage wrappers**.
- [ ] **Step 4: Replace home-local click history writes** with the shared helper while retaining feed-session snapshots for restoration.
- [ ] **Step 5: Record clicks from every detail recommendation card** before navigating.
- [ ] **Step 6: Run both Node test files and `npx tsc --noEmit`**.
- [ ] **Step 7: Commit** with message `feat: 홈 상세 클릭 취향 공유`.

### Task 4: Home normal tail, demoted tail, then repeat cycle

**Files:**
- Modify: `src/app/(user)/feed-actions.ts`
- Modify: `src/components/user/ExploreGallery.tsx`
- Modify: `src/lib/discovery.ts`
- Modify: `src/lib/feed-demotion.test.ts`

**Interfaces:**
- Produces: `loadDemotedHomePhotos(seed, page, clickedPhotoIds, seenIds)` and a feed phase state `normal | demoted` stored with `cycle` in `FeedSession`.

- [ ] **Step 1: Add failing tests** for phase order: final normal page → demoted pages → new-cycle normal page, and for allowing previous-cycle IDs while rejecting current-cycle duplicates.
- [ ] **Step 2: Run the ranking test** and confirm the phase helper is missing.
- [ ] **Step 3: Add normal-only and demoted-only seeded page queries** using the same published/approved conditions and deterministic seed ordering.
- [ ] **Step 4: Update home personalization** to include demoted similar candidates according to the promotion stage instead of excluding them.
- [ ] **Step 5: Update `ExploreGallery` state machine** so an empty normal page switches to demoted page 0, an empty demoted page increments the cycle and returns to normal page 0, and `seenPhotoIds` contains only the current cycle's IDs.
- [ ] **Step 6: Persist and restore phase, page, cycle, and current-cycle seen IDs** in `FeedSession`.
- [ ] **Step 7: Run Node tests, `npx tsc --noEmit`, and `git diff --check`**.
- [ ] **Step 8: Commit** with message `feat: 홈 피드 노출 낮춤 꼬리 추가`.

### Task 5: Detail reranking and admin terminology

**Files:**
- Modify: `src/app/(user)/photos/[id]/page.tsx`
- Modify: `src/app/(user)/photos/[id]/PhotoExplore.tsx`
- Modify: `src/app/(user)/feed-actions.ts`
- Modify: `src/app/(admin)/admin/photos/page.tsx`
- Modify: `src/app/(admin)/admin/photos/PhotoVisibilityGrid.tsx`
- Modify: `src/app/(admin)/admin/photos/actions.ts`

**Interfaces:**
- Produces: server action `loadRankedDetailRecommendations(photoId, clickedPhotoIds)` returning ranked `ExplorePhoto[]`.

- [ ] **Step 1: Add a failing ranking test** asserting detail composition is normal similar → demoted similar → unrelated tail for one anchor.
- [ ] **Step 2: Run the ranking test** and verify the detail composition assertion fails.
- [ ] **Step 3: Keep SSR recommendations based on the current photo**, then have `PhotoExplore` read shared click history on mount and call `loadRankedDetailRecommendations` once to rerank before further scrolling.
- [ ] **Step 4: Preserve the seeded unrelated-photo tail** and remove only IDs already present in the current detail recommendation list.
- [ ] **Step 5: Replace all `/admin/photos` user-facing `숨김` copy** with `노출 낮춤`, `노출 복구`, and corresponding accessible labels; keep database and server-action field names compatible.
- [ ] **Step 6: Run both Node test files, `npx tsc --noEmit`, targeted ESLint, and `git diff --check`**.
- [ ] **Step 7: Run the local app and verify** `/admin/photos` terminology, a detail recommendation click contributing to shared history, and home continuation after normal and demoted tails.
- [ ] **Step 8: Commit** with message `feat: 상세 추천 노출 낮춤 승격 적용`.

### Task 6: Final verification and documentation alignment

**Files:**
- Modify if needed: `docs/superpowers/specs/2026-08-12-feed-demotion-ranking-design.md`
- Modify if needed: `docs/22-visual-similarity.md`

**Interfaces:**
- Produces no runtime API; ensures implementation and documentation agree.

- [ ] **Step 1: Run** `node --test src/lib/feed-demotion.test.ts src/lib/feed-click-history.test.ts`.
- [ ] **Step 2: Run** `npx tsc --noEmit`, targeted ESLint for changed files, `git diff --check`, and `npm run build`.
- [ ] **Step 3: Query Supabase read-only** to confirm all existing `feed_hidden=true` rows remain unchanged and the RPC migration SQL has the intended return schema.
- [ ] **Step 4: Compare implementation against every design requirement** and update documentation only where actual behavior requires clarification.
- [ ] **Step 5: Commit documentation-only corrections**, if any, with message `docs: 노출 낮춤 추천 동작 정리`.
