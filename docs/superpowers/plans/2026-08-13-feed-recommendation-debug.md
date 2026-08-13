# Feed Recommendation Debug Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make demoted recommendation promotion observable and resettable in local short-feed debug mode.

**Architecture:** A pure helper decorates already-ranked recommendation candidates with diagnostic metadata without changing ranking. Development server responses carry the optional metadata to `ExploreGallery`, which renders a debug panel and card badges only for `?feedDebug=1`.

**Tech Stack:** TypeScript, React, Next.js server actions, Node test runner

## Global Constraints

- Diagnostic UI appears only for `?feedDebug=1` in development.
- Production ranking and response behavior remain unchanged.
- Reset clears shared click history and the isolated feed-debug session.

---

### Task 1: Recommendation debug metadata

**Files:**
- Modify: `src/lib/feed-demotion.ts`
- Modify: `src/lib/feed-demotion.test.ts`
- Modify: `src/lib/discovery.ts`

- [ ] Write a failing test for `attachRecommendationDebug` with literal natural and inserted ranks.
- [ ] Run the test and confirm the missing export failure.
- [ ] Implement the pure decorator and add optional metadata to `GalleryPhoto`.
- [ ] Decorate development-only personalized recommendations after final ranking.
- [ ] Re-run the test to green.

### Task 2: Debug panel, badges, and reset

**Files:**
- Modify: `src/components/user/ExploreGallery.tsx`
- Modify: `src/lib/feed-click-history.ts`
- Modify: `src/lib/feed-click-history.test.ts`

- [ ] Add a failing test for the pure click-history clear operation using an injected storage value.
- [ ] Implement `clearFeedClicks` and verify the test passes.
- [ ] Render recommendation summary and demoted ID details from visible recommendation metadata.
- [ ] Pass optional metadata into `PhotoCard` and render recommendation badges only in feed debug mode.
- [ ] Add reset control that clears click history, isolated feed cache, and reloads the debug home.
- [ ] Run all related tests, type checking, targeted lint, and production build.
- [ ] Commit with `feat: 추천 승격 디버그 패널 추가`.
