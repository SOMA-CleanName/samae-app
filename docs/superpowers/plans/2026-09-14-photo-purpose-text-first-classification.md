# Text-First Photo Purpose Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect portfolios to real packages and classify every unprotected portfolio from useful author text first, falling back to existing SigLIP image scores only when text has no purpose signal.

**Architecture:** A new migration adds the package foreign key, optional photo text, classification evidence, and a generalized atomic classification RPC. A pure Python text evidence module converts portfolio metadata into high-confidence purpose candidates; the existing image classifier remains unchanged and feeds a deterministic text/image decision layer. Photographer upload/edit flows persist package identity, and the admin workspace exposes classification source, evidence, and package linkage.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase/PostgreSQL, Python 3, NumPy, Node test runner

**Spec:** `docs/superpowers/specs/2026-09-14-photo-purpose-text-first-classification-design.md`

## Global Constraints

- Purpose codes remain exactly `personal`, `couple`, `friendship`, `wedding`, `pet`, `commercial`, `event`.
- Existing `mood_tags`, `generated_tags`, `auto_mood_tags`, target/explore category values are never written by this feature.
- `mood_tags` may be read because it is the photographer-authored hashtag source.
- `generated_tags` and `auto_mood_tags` are excluded from classification input.
- `manual`, `admin_purpose_reviewed=true`, and `admin_purpose_overridden=true` rows are never overwritten by automatic reclassification.
- A package is used only through the portfolio's real `albums.package_id`; never infer it from all packages owned by the photographer.
- General-user UI must not display `admin_purpose` or `admin_purpose_evidence`.
- The new classifier version is exactly `purpose-v4-text-first`.

---

## File Map

- `supabase/migrations/0115_photo_purpose_text_first.sql`: schema, constraints, guards, package FK, and atomic classification RPC.
- `src/lib/portfolio-package.ts`: pure package-selection validation shared by tests and server actions.
- `src/lib/portfolio-package.test.ts`: package selection and price snapshot tests.
- `src/app/(photographer)/studio/portfolio/PortfolioUploader.tsx`: submits package ID and optional per-photo text.
- `src/app/(photographer)/studio/portfolio/PortfolioManager.tsx`: sends per-photo metadata during upload.
- `src/app/(photographer)/studio/portfolio/PortfolioEditManager.tsx`: edits package link and photo title/caption.
- `src/app/(photographer)/studio/portfolio/actions.ts`: verifies package ownership and persists album/photo metadata.
- `src/app/(photographer)/studio/portfolio/page.tsx`: loads album package links and photo text for editing.
- `src/app/api/portfolio/upload/route.ts`: persists photo title/caption and inherits package price from the verified album.
- `scripts/embed/purpose_text.py`: pure text normalization, phrase matching, negation, source priority, and conflict detection.
- `scripts/embed/test_purpose_text.py`: exhaustive text evidence tests.
- `scripts/embed/purpose_classifier.py`: combines text evidence with existing SigLIP album predictions.
- `scripts/embed/test_purpose_classifier.py`: hybrid decision tests.
- `scripts/embed/purpose_backfill.py`: fetches all approved text sources, produces evidence artifacts, and calls generalized RPC.
- `scripts/embed/test_purpose_backfill.py`: fetch/apply protection and payload tests.
- `src/lib/photo-purpose-admin.ts`: widened source/evidence/package view types and filters.
- `src/lib/photo-purpose-admin.test.ts`: grouping and source filter tests.
- `src/app/(admin)/admin/photo-purpose/page.tsx`: joins classification evidence, package, category, and author tags.
- `src/app/(admin)/admin/photo-purpose/PhotoPurposeWorkspace.tsx`: displays source/evidence/package and package-link control.
- `src/app/(admin)/admin/photo-purpose/actions.ts`: validates and saves an admin package link.
- `docs/39-photo-purpose-taxonomy.md`: records the v4 text-first operational result.

---

### Task 1: Add text-first schema and atomic storage

**Files:**
- Create: `supabase/migrations/0115_photo_purpose_text_first.sql`

**Interfaces:**
- Produces: `albums.package_id`, `photos.title`, `photos.caption`, both tables' `admin_purpose_evidence`.
- Produces: `apply_album_purpose_classification(uuid,text,real,text,text,jsonb) returns integer`.
- Consumes: `packages(id)`, existing purpose columns and protection flags.

- [ ] **Step 1: Write the migration assertions before applying it**

Prepare read-only SQL assertions for the post-migration state:

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'albums'
  and column_name in ('package_id', 'admin_purpose_evidence');

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'photos'
  and column_name in ('title', 'caption', 'admin_purpose_evidence');
```

Expected before migration: one or more required rows are absent.

- [ ] **Step 2: Create the migration**

Add nullable columns and indexes, recreate source checks with `('siglip','text','hybrid','manual')`, and extend the existing guard functions so evidence is admin/service-only. Create the generalized RPC with these validation and protection predicates:

```sql
if p_source not in ('siglip', 'text', 'hybrid') then
  raise exception '허용되지 않은 자동 분류 출처입니다: %', p_source;
end if;

update public.albums
set admin_purpose = p_purpose,
    admin_purpose_confidence = p_confidence,
    admin_purpose_source = p_source,
    admin_purpose_version = p_version,
    admin_purpose_evidence = p_evidence,
    admin_purpose_reviewed = false,
    admin_purpose_at = now()
where id = p_album_id
  and not admin_purpose_reviewed
  and admin_purpose_source is distinct from 'manual';
```

Propagate the same fields to photos where all three protection conditions are false. Update manual-set and override-clear RPCs so stale automatic evidence is cleared or inherited consistently.

- [ ] **Step 3: Apply the migration and run rollback-safe DB verification**

Run the project's Supabase migration workflow. In a transaction, insert a temporary photographer/package/album/photos fixture, call the new RPC, verify album and non-overridden photos match, verify a manual photo remains unchanged, then roll back.

- [ ] **Step 4: Verify protected columns are unchanged**

Snapshot hashes/counts for `mood_tags`, `generated_tags`, `auto_mood_tags`, and target/explore memberships before and after the migration. Expected: exact equality.

- [ ] **Step 5: Commit the schema task**

```bash
git add supabase/migrations/0115_photo_purpose_text_first.sql
git commit -m "feat: add text-first purpose classification schema"
```

### Task 2: Persist real package identity and optional photo text

**Files:**
- Create: `src/lib/portfolio-package.ts`
- Create: `src/lib/portfolio-package.test.ts`
- Modify: `src/app/(photographer)/studio/portfolio/PortfolioUploader.tsx`
- Modify: `src/app/(photographer)/studio/portfolio/PortfolioManager.tsx`
- Modify: `src/app/(photographer)/studio/portfolio/PortfolioEditManager.tsx`
- Modify: `src/app/(photographer)/studio/portfolio/actions.ts`
- Modify: `src/app/(photographer)/studio/portfolio/page.tsx`
- Modify: `src/app/api/portfolio/upload/route.ts`

**Interfaces:**
- Produces: `PackageSelection = { packageId: string | null; priceKrw: number | null }`.
- Produces: `UploadPayload.packageId` and `UploadPayload.photoTextByKey`.
- Consumes: `PackageOption = { id:string; name:string; price_krw:number }`.

- [ ] **Step 1: Write failing package-selection tests**

```ts
test("returns the real package id and its price", () => {
  assert.deepEqual(resolvePackageSelection([{ id: "pkg", name: "커플", price_krw: 90000 }], "pkg"), {
    packageId: "pkg",
    priceKrw: 90000,
  });
});

test("empty selection produces no package and no price", () => {
  assert.deepEqual(resolvePackageSelection([], ""), { packageId: null, priceKrw: null });
});

test("unknown package ids are rejected", () => {
  assert.throws(() => resolvePackageSelection([], "missing"), /패키지/);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx tsx --test src/lib/portfolio-package.test.ts`

Expected: FAIL because `resolvePackageSelection` does not exist.

- [ ] **Step 3: Implement the pure helper**

```ts
export function resolvePackageSelection(packages: PackageOption[], rawId: string): PackageSelection {
  const id = rawId.trim();
  if (!id) return { packageId: null, priceKrw: null };
  const selected = packages.find((item) => item.id === id);
  if (!selected) throw new Error("선택한 패키지를 찾을 수 없습니다.");
  return { packageId: selected.id, priceKrw: selected.price_krw };
}
```

- [ ] **Step 4: Change upload selection from price to package ID**

Rename uploader state/payload from `price` to `packageId`. Set each `<option value={pk.id}>`. Add `photoTextByKey: Record<string,{title:string;caption:string}>` and optional title/caption inputs for the currently selected preview. `PortfolioManager` passes `title` and `caption` for each file and calls:

```ts
const { id: albumId } = await createPost({
  description: p.description,
  packageId: p.packageId || null,
});
```

- [ ] **Step 5: Verify package ownership in server actions**

Change `createPost` and `updateFeedMeta` to query the selected package by `id`, authenticated `photographer_id`, and active/owned status before writing `albums.package_id`. Copy its `price_krw` to album/photo price snapshots. An empty selection writes both package and price as `null`.

- [ ] **Step 6: Persist photo text and inherit album metadata in the upload route**

Parse `title` to 120 characters and `caption` to 1000 characters. When `album_id` exists, load the owned album's `package_id` and `price_krw`, use the album price instead of trusting client price, then insert the text fields.

- [ ] **Step 7: Add edit-flow fields**

Load `albums.package_id` plus `photos.title,caption` on the portfolio page. Use package ID as the edit select value. Add a selected-photo title/caption editor and persist those fields only to its photo while shared metadata remains portfolio-wide.

- [ ] **Step 8: Run focused and project checks**

Run:

```bash
npx tsx --test src/lib/portfolio-package.test.ts
npm run lint
npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 9: Commit the persistence task**

```bash
git add src/lib/portfolio-package.ts src/lib/portfolio-package.test.ts src/app/\(photographer\)/studio/portfolio src/app/api/portfolio/upload/route.ts
git commit -m "feat: link portfolios to packages"
```

### Task 3: Implement pure text evidence extraction

**Files:**
- Create: `scripts/embed/purpose_text.py`
- Create: `scripts/embed/test_purpose_text.py`

**Interfaces:**
- Produces: `TextField(source:str, text:str, priority:int)`.
- Produces: `TextEvidence(purpose:str|None, candidates:tuple[str,...], confidence:float, conflict:bool, matches:tuple[dict,...])`.
- Produces: `classify_text(fields: Sequence[TextField]) -> TextEvidence`.

- [ ] **Step 1: Write failing explicit-purpose tests**

Cover these exact outcomes:

```python
self.assertEqual(classify_text([field("album_description", "영화 분위기의 커플 스냅입니다")]).purpose, "couple")
self.assertEqual(classify_text([field("album_title", "봄날 웨딩 촬영")]).purpose, "wedding")
self.assertEqual(classify_text([field("photo_caption", "졸업 기념 사진")]).purpose, "event")
self.assertEqual(classify_text([field("package_name", "제품 광고")]).purpose, "commercial")
```

- [ ] **Step 2: Write failing non-purpose, negation, and listing tests**

```python
self.assertIsNone(classify_text([field("hashtags", "필름 빈티지 골목 노을")]).purpose)
self.assertNotIn("wedding", classify_text([field("description", "웨딩은 촬영하지 않습니다")]).candidates)
self.assertEqual(
    classify_text([field("package_name", "커플/우정/다인원 촬영")]).candidates,
    ("couple", "friendship", "event"),
)
```

- [ ] **Step 3: Run tests and verify failure**

Run: `scripts/embed/.venv/bin/python -m unittest scripts.embed.test_purpose_text -v`

Expected: FAIL because the module is absent.

- [ ] **Step 4: Implement normalized phrase dictionaries**

Define versioned Korean purpose phrases, including the taxonomy's subcategory words as parent signals. Normalize Unicode, whitespace, separators, and case. Match longer phrases before single terms. Detect `않`, `안 함`, `제외`, `불가` within the same sentence as a negative. Detect `/`, `·`, comma, and `가능` service listings as candidate sets rather than a single winner.

- [ ] **Step 5: Implement source priority and safe evidence**

Use fixed priorities: photo title/caption 5, album title/description 4, categories 3, package text 2, hashtags 1. Store only source, purpose, matched phrase, and strength in `matches`; do not copy full descriptions.

- [ ] **Step 6: Run the complete text test suite**

Run: `scripts/embed/.venv/bin/python -m unittest scripts.embed.test_purpose_text -v`

Expected: PASS.

- [ ] **Step 7: Commit the text classifier task**

```bash
git add scripts/embed/purpose_text.py scripts/embed/test_purpose_text.py
git commit -m "feat: classify photo purpose from author text"
```

### Task 4: Combine text evidence with SigLIP and backfill safely

**Files:**
- Modify: `scripts/embed/purpose_classifier.py`
- Modify: `scripts/embed/test_purpose_classifier.py`
- Modify: `scripts/embed/purpose_backfill.py`
- Modify: `scripts/embed/test_purpose_backfill.py`
- Modify: `scripts/embed/purposes.py`

**Interfaces:**
- Produces: `FinalPurposePrediction(album_id,purpose,confidence,source,evidence,photo_count)`.
- Produces: `combine_prediction(text:TextEvidence,image:AlbumPrediction) -> FinalPurposePrediction`.
- Consumes: Task 1 RPC and Task 3 `classify_text`.

- [ ] **Step 1: Write failing combination tests**

Assert:

```python
# Explicit text cannot be overturned by a close visual score.
self.assertEqual(combine(explicit("couple"), image("friendship", 0.43)).purpose, "couple")
self.assertEqual(combine(explicit("couple"), image("friendship", 0.43)).source, "text")

# No useful text uses SigLIP.
self.assertEqual(combine(empty_text(), image("wedding", 0.91)).source, "siglip")

# A package listing constrains the image winner to listed candidates.
self.assertEqual(combine(candidates("couple", "friendship", "event"), image("friendship", 0.7)).source, "hybrid")

# Unresolved strong text conflict stays unclassified.
self.assertIsNone(combine(conflict("couple", "friendship"), image("couple", 0.99)).purpose)
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `scripts/embed/.venv/bin/python -m unittest scripts.embed.test_purpose_classifier -v`

- [ ] **Step 3: Implement the deterministic decision layer**

Keep numerical SigLIP functions intact. Add a final prediction dataclass and combination function. Text-only confidence reflects evidence strength, not probability. Hybrid confidence combines text strength with the image confidence but remains clamped to `[0,1]`.

- [ ] **Step 4: Expand backfill fetches without reading unrelated packages**

Fetch albums with package relation, target category label, explore-category labels, title/description/evidence fields; fetch photos with title/caption/mood tags and embeddings. Build fields per album/photo. Never attach a package unless returned through that album's `package_id` relation.

- [ ] **Step 5: Change apply payload and artifacts**

Call `rpc/apply_album_purpose_classification` with:

```python
{
    "p_album_id": item.album_id,
    "p_purpose": item.purpose,
    "p_confidence": item.confidence,
    "p_source": item.source,
    "p_version": "purpose-v4-text-first",
    "p_evidence": item.evidence,
}
```

JSON/CSV artifacts must contain `source`, `text_candidates`, `text_matches`, image top purpose, and applied purpose. Dry-run remains the default.

- [ ] **Step 6: Test fetch protection and exact RPC payload**

Extend fake-request tests to assert package/category/photo text fields are requested, reviewed/manual/overridden rows remain excluded, dry-run makes no POST, and apply uses only the generalized RPC.

- [ ] **Step 7: Run all Python purpose tests**

Run:

```bash
scripts/embed/.venv/bin/python -m unittest \
  scripts.embed.test_purpose_text \
  scripts.embed.test_purpose_classifier \
  scripts.embed.test_purpose_backfill -v
```

Expected: all pass.

- [ ] **Step 8: Commit the hybrid classifier task**

```bash
git add scripts/embed/purpose_classifier.py scripts/embed/test_purpose_classifier.py scripts/embed/purpose_backfill.py scripts/embed/test_purpose_backfill.py scripts/embed/purposes.py
git commit -m "feat: prioritize metadata in purpose classification"
```

### Task 5: Expose evidence and package linkage in the admin workspace

**Files:**
- Modify: `src/lib/photo-purpose-admin.ts`
- Modify: `src/lib/photo-purpose-admin.test.ts`
- Modify: `src/app/(admin)/admin/photo-purpose/page.tsx`
- Modify: `src/app/(admin)/admin/photo-purpose/PhotoPurposeWorkspace.tsx`
- Modify: `src/app/(admin)/admin/photo-purpose/actions.ts`

**Interfaces:**
- Produces: `PurposeSource = 'siglip'|'text'|'hybrid'|'manual'|null`.
- Produces: `AdminPurposeEvidence` and package option fields on `AdminPurposeAlbum`.
- Produces: `setAlbumPackage(albumId:string, packageId:string|null): Promise<void>`.

- [ ] **Step 1: Write failing grouping/filter tests**

Add rows with `text` and `hybrid` sources and compact evidence. Assert source survives grouping, automatic filtering includes all three automatic sources, and package fields remain attached to the correct album only.

- [ ] **Step 2: Run the focused TypeScript test and verify failure**

Run: `npx tsx --test src/lib/photo-purpose-admin.test.ts`

- [ ] **Step 3: Widen types and filters**

Define `AUTOMATIC_PURPOSE_SOURCES = new Set(['siglip','text','hybrid'])`. Use it for automatic and low-confidence filters. Add package ID/name, available photographer package options, and evidence to grouped albums.

- [ ] **Step 4: Fetch exact evidence sources for display**

Extend the admin query with album/photo evidence, package name/description, title/caption, author hashtags, target label, and explore labels. Do not select AI-generated tag fields.

- [ ] **Step 5: Add guarded package-link action**

Require admin role, validate UUIDs, fetch album photographer, verify the package belongs to the same photographer, then update only `albums.package_id`. `null` clears the link.

- [ ] **Step 6: Render evidence and package controls**

Display badges `텍스트`, `SigLIP`, `텍스트+SigLIP`, `수동`; show compact matched phrases and the image fallback candidate. Add a package select whose options contain only the selected portfolio photographer's packages. Add filters for text conflict and package unlinked.

- [ ] **Step 7: Run UI library checks**

Run:

```bash
npx tsx --test src/lib/photo-purpose-admin.test.ts
npm run lint
npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 8: Commit the admin task**

```bash
git add src/lib/photo-purpose-admin.ts src/lib/photo-purpose-admin.test.ts src/app/\(admin\)/admin/photo-purpose
git commit -m "feat: show purpose classification evidence"
```

### Task 6: Dry-run, apply, and regression verification

**Files:**
- Modify: `docs/39-photo-purpose-taxonomy.md`

**Interfaces:**
- Consumes: `purpose-v4-text-first` classifier and migration.
- Produces: validated DB classifications and an auditable dry-run artifact directory.

- [ ] **Step 1: Snapshot protected data**

Export stable JSON hashes/counts for all rows' `mood_tags`, `generated_tags`, `auto_mood_tags`, `albums.target_category_id`, and explore memberships to `/private/tmp/samae-purpose-analysis/purpose-v4/protected-before.json`.

- [ ] **Step 2: Run all automated tests before touching classification values**

Run:

```bash
npx tsx --test src/lib/portfolio-package.test.ts src/lib/photo-purpose-admin.test.ts
scripts/embed/.venv/bin/python -m unittest \
  scripts.embed.test_purpose_text \
  scripts.embed.test_purpose_classifier \
  scripts.embed.test_purpose_backfill -v
npm run lint
npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 3: Generate the complete dry-run**

Run the backfill without `--apply`, including unpublished photos to match the previous full-catalog run, and write to `/private/tmp/samae-purpose-analysis/purpose-v4/dry-run`.

Expected: no database writes; artifacts report all eligible portfolios and source distribution.

- [ ] **Step 4: Verify the reported regression case**

Inspect album `92c88f6f-9403-4eb1-a1db-19811064d474`. Expected:

```json
{
  "applied_purpose": "couple",
  "source": "text",
  "matched_phrase": "커플 스냅"
}
```

- [ ] **Step 5: Apply only unprotected automatic rows**

Run the v4 batch with explicit `--apply`. Do not use an option that bypasses manual/review/override protection. Record processed, classified, unclassified, failed, and updated-photo counts.

- [ ] **Step 6: Requery invariants**

Verify album/non-overridden-photo purpose equality, no protected row's before/after purpose changed, and the protected-data snapshot exactly matches Step 1.

- [ ] **Step 7: Browser-check photographer and admin flows**

At local port 3000, verify a photographer can create/edit a portfolio with a package ID and photo text, and an admin can inspect source/evidence and change a package link. Verify a public photo page does not render purpose/evidence.

- [ ] **Step 8: Document measured v4 results**

Update `docs/39-photo-purpose-taxonomy.md` with version, source distribution, classified/unclassified counts, regression case result, protection counts, and artifact path.

- [ ] **Step 9: Commit operational documentation**

```bash
git add docs/39-photo-purpose-taxonomy.md
git commit -m "docs: record text-first purpose backfill"
```

---

## Self-Review

- Spec coverage: package FK, photo text, all approved author text sources, text utility gating, SigLIP fallback, hybrid conflict handling, evidence, admin visibility, protection, dry-run, and protected-column verification are each assigned to a task.
- Placeholder scan: no deferred implementation markers or unspecified error-handling steps remain.
- Type consistency: source values, package selection shape, classifier version, evidence payload, and generalized RPC names are consistent across tasks.
