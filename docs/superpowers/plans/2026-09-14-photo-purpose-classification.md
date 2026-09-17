# Photo Purpose Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add direct purpose-classification columns to albums and photos, classify public portfolios with the existing SigLIP2 embeddings, persist high-confidence results to albums and every member photo, and provide an admin-only review workspace with photo overrides.

**Architecture:** PostgreSQL stores the same stable purpose code on each album and member photo, with `admin_purpose_overridden` protecting photo exceptions. A Python batch reuses `photos.embedding`, embeds equal-sized English prompt ensembles with the local SigLIP2 text tower, produces a dry-run report, and calls atomic RPCs only when `--apply` is explicit. The Next.js admin route lists portfolio groups and uses server actions backed by the same atomic RPCs.

**Tech Stack:** PostgreSQL/Supabase migrations and RPCs, Python 3.12 + NumPy + PyTorch + Transformers SigLIP2, Next.js 16 App Router, React 19, TypeScript, Node test runner, Python `unittest`.

**Spec:** `docs/superpowers/specs/2026-09-14-photo-purpose-classification-design.md`

## Global Constraints

- Store only these purpose codes: `personal`, `couple`, `friendship`, `wedding`, `pet`, `commercial`, `event`.
- Do not read or write `mood_tags`, `generated_tags`, `auto_mood_tags`, `target_category_id`, or category membership tables in classification or admin mutations.
- Use only `google/siglip2-so400m-patch16-naflex`; no paid API or auxiliary VLM.
- Reuse normalized `photos.embedding`; do not download photos or regenerate image embeddings.
- First-pass classification is album-level. Persist the album result to every member photo, but never create automatic photo overrides.
- Never overwrite rows with `admin_purpose_reviewed=true`, `admin_purpose_source='manual'`, or `photos.admin_purpose_overridden=true`.
- Batch execution is dry-run by default. Only `--apply` may write classification data.
- User-facing pages and search types must not select or render the new fields.
- Subcategories are not classified or stored.

---

### Task 1: Purpose contract and database schema

**Files:**
- Create: `supabase/migrations/0113_photo_purpose_classification.sql`
- Create: `src/lib/photo-purpose.ts`
- Create: `src/lib/photo-purpose.test.ts`

**Interfaces:**
- Produces: `PURPOSE_OPTIONS`, `PurposeKey`, `isPurposeKey(value)`, `purposeLabel(key)`.
- Produces RPCs: `apply_siglip_album_purpose(uuid,text,real,text)`, `set_album_admin_purpose(uuid,text)`, `set_photo_admin_purpose(uuid,text)`, `clear_photo_admin_purpose_override(uuid)`.
- Consumes: existing `public.is_admin()`, album/photo foreign-key relation, service-role/admin server calls.

- [ ] **Step 1: Write the failing TypeScript contract tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { PURPOSE_OPTIONS, isPurposeKey, purposeLabel } from "./photo-purpose";

test("purpose contract exposes exactly the seven approved stable codes", () => {
  assert.deepEqual(PURPOSE_OPTIONS.map((x) => x.key), [
    "personal", "couple", "friendship", "wedding", "pet", "commercial", "event",
  ]);
});

test("purpose keys validate and map to Korean labels", () => {
  assert.equal(isPurposeKey("wedding"), true);
  assert.equal(isPurposeKey("graduation"), false);
  assert.equal(purposeLabel("commercial"), "상업/브랜드");
});
```

- [ ] **Step 2: Run the contract tests and verify failure**

Run: `npx tsx --test src/lib/photo-purpose.test.ts`

Expected: FAIL because `src/lib/photo-purpose.ts` does not exist.

- [ ] **Step 3: Implement the TypeScript purpose contract**

```ts
export const PURPOSE_OPTIONS = [
  { key: "personal", label: "개인" },
  { key: "couple", label: "커플" },
  { key: "friendship", label: "우정" },
  { key: "wedding", label: "웨딩" },
  { key: "pet", label: "반려동물" },
  { key: "commercial", label: "상업/브랜드" },
  { key: "event", label: "행사" },
] as const;

export type PurposeKey = (typeof PURPOSE_OPTIONS)[number]["key"];
const KEYS = new Set<string>(PURPOSE_OPTIONS.map((x) => x.key));

export function isPurposeKey(value: unknown): value is PurposeKey {
  return typeof value === "string" && KEYS.has(value);
}

export function purposeLabel(key: PurposeKey): string {
  return PURPOSE_OPTIONS.find((x) => x.key === key)!.label;
}
```

- [ ] **Step 4: Run the contract tests and verify pass**

Run: `npx tsx --test src/lib/photo-purpose.test.ts`

Expected: 2 tests PASS.

- [ ] **Step 5: Write migration `0113` with direct columns and checks**

Add the six common columns to `public.albums` and `public.photos`, plus `admin_purpose_overridden boolean not null default false` to photos. Add table-scoped, idempotent checks for the seven purpose codes, confidence range, and source values. Add `(admin_purpose_reviewed, admin_purpose)` indexes.

The migration must define atomic functions with these signatures:

```sql
public.apply_siglip_album_purpose(
  p_album_id uuid,
  p_purpose text,
  p_confidence real,
  p_version text
) returns integer

public.set_album_admin_purpose(
  p_album_id uuid,
  p_purpose text
) returns integer

public.set_photo_admin_purpose(
  p_photo_id uuid,
  p_purpose text
) returns void

public.clear_photo_admin_purpose_override(
  p_photo_id uuid
) returns void
```

`apply_siglip_album_purpose` updates the album unless it is reviewed/manual, then updates every member photo unless it is reviewed/manual/overridden. `p_purpose` accepts null for a processed-but-unclassified album. Manual setters require `public.is_admin()`, set `source='manual'` and `reviewed=true`, and propagate album values only to non-overridden photos. Revoke public execution and grant execution to `authenticated` and `service_role`.

- [ ] **Step 6: Verify migration structure without applying it**

Run: `node scripts/verify-migrations.cjs`

Expected: PASS with no duplicate migration name and no SQL structural warning.

- [ ] **Step 7: Commit Task 1**

```bash
git add supabase/migrations/0113_photo_purpose_classification.sql src/lib/photo-purpose.ts src/lib/photo-purpose.test.ts
git commit -m "feat: add photo purpose classification schema"
```

---

### Task 2: Pure SigLIP purpose classifier

**Files:**
- Create: `scripts/embed/purposes.py`
- Create: `scripts/embed/purpose_classifier.py`
- Create: `scripts/embed/test_purpose_classifier.py`

**Interfaces:**
- Consumes: `scripts.embed.siglip.encode_text`, 1152-dimensional normalized image embeddings.
- Produces: `PURPOSE_KEYS`, `PROMPTS`, `VERSION`, `AUTO_THRESHOLD`, `AUTO_ENABLED`, `check_prompts()`.
- Produces: `classify_catalog(photo_rows, embeddings, text_vectors) -> list[AlbumPrediction]` with per-album `purpose`, `confidence`, `conflict`, and `photo_count`.

- [ ] **Step 1: Write failing classifier tests**

Tests must cover equal prompt counts, column z-score behavior, per-purpose maximum, album median aggregation, majority agreement, tie/conflict handling, confidence range, and non-finite rejection.

```python
class PurposeClassifierTest(unittest.TestCase):
    def test_prompt_groups_have_equal_nonzero_size(self):
        counts = {len(v) for v in purposes.PROMPTS.values()}
        self.assertEqual(counts, {8})

    def test_album_requires_median_and_majority_to_agree(self):
        scores = np.array([
            [3.0, 0.0], [2.0, 0.0], [0.0, 5.0],
        ])
        result = classifier.aggregate_album(scores, ("personal", "wedding"))
        self.assertEqual(result.purpose, "personal")
        self.assertFalse(result.conflict)

    def test_nonfinite_input_is_rejected(self):
        with self.assertRaises(ValueError):
            classifier.zscore_columns(np.array([[float("nan")]]))
```

- [ ] **Step 2: Run the classifier tests and verify failure**

Run: `scripts/embed/.venv/bin/python -m unittest scripts.embed.test_purpose_classifier -v`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Define eight caption prompts per purpose**

Use English caption sentences. The `event` group includes group event, first birthday, maternity, baby, graduation, banquet, and club-gathering prototypes but still outputs only `event`. `commercial` includes fashion lookbook, shopping mall campaign, product advertisement, brand campaign, and business headshot prototypes. `check_prompts()` rejects missing keys, unequal counts, blank strings, or duplicates.

- [ ] **Step 4: Implement pure numerical classification**

```python
@dataclass(frozen=True)
class AlbumEvidence:
    album_id: str
    candidate: str | None
    margin: float
    majority_ratio: float
    conflict: bool
    photo_count: int
    top_scores: tuple[float, float]

@dataclass(frozen=True)
class AlbumPrediction:
    album_id: str
    purpose: str | None
    confidence: float
    conflict: bool
    photo_count: int
    top_scores: tuple[float, float]

def zscore_columns(cosine: np.ndarray) -> np.ndarray:
    if cosine.ndim != 2 or not np.isfinite(cosine).all():
        raise ValueError("cosine matrix must be finite and two-dimensional")
    sd = cosine.std(axis=0)
    if np.any(sd == 0):
        raise ValueError("prompt score standard deviation must be nonzero")
    return (cosine - cosine.mean(axis=0)) / sd

def scores_by_purpose(
    zscores: np.ndarray,
    prompt_slices: dict[str, slice],
) -> np.ndarray:
    return np.stack(
        [zscores[:, prompt_slices[key]].max(axis=1) for key in purposes.PURPOSE_KEYS],
        axis=1,
    )

def aggregate_album(
    album_id: str,
    scores: np.ndarray,
    keys: Sequence[str],
) -> AlbumEvidence:
    medians = np.median(scores, axis=0)
    median_order = np.argsort(-medians)
    votes = np.argmax(scores, axis=1)
    vote_counts = np.bincount(votes, minlength=len(keys))
    vote_order = np.argsort(-vote_counts)
    tied = len(vote_counts) > 1 and vote_counts[vote_order[0]] == vote_counts[vote_order[1]]
    conflict = tied or median_order[0] != vote_order[0]
    return AlbumEvidence(
        album_id=album_id,
        candidate=None if conflict else keys[int(median_order[0])],
        margin=float(medians[median_order[0]] - medians[median_order[1]]),
        majority_ratio=float(vote_counts[vote_order[0]] / len(scores)),
        conflict=conflict,
        photo_count=len(scores),
        top_scores=(float(medians[median_order[0]]), float(medians[median_order[1]])),
    )

def calibrate_evidence(items: Sequence[AlbumEvidence]) -> list[AlbumPrediction]:
    margins = np.array([item.margin for item in items], dtype=np.float64)
    order = np.argsort(np.argsort(margins, kind="stable"), kind="stable")
    denominator = max(len(items) - 1, 1)
    out = []
    for item, rank in zip(items, order, strict=True):
        confidence = ((float(rank) / denominator) + item.majority_ratio) / 2.0
        out.append(AlbumPrediction(
            album_id=item.album_id,
            purpose=item.candidate,
            confidence=max(0.0, min(1.0, confidence)),
            conflict=item.conflict,
            photo_count=item.photo_count,
            top_scores=item.top_scores,
        ))
    return out
```

Normalize confidence from the catalog percentile of top1-top2 margin multiplied by majority ratio. Treat a median/majority disagreement or vote tie as `purpose=None, conflict=True`.

- [ ] **Step 5: Run classifier tests and verify pass**

Run: `scripts/embed/.venv/bin/python -m unittest scripts.embed.test_purpose_classifier -v`

Expected: all classifier tests PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add scripts/embed/purposes.py scripts/embed/purpose_classifier.py scripts/embed/test_purpose_classifier.py
git commit -m "feat: add SigLIP purpose classifier"
```

---

### Task 3: Dry-run report and safe database backfill

**Files:**
- Create: `scripts/embed/purpose_backfill.py`
- Create: `scripts/embed/test_purpose_backfill.py`
- Modify: `scripts/embed/check_db.py`

**Interfaces:**
- Consumes: `purpose_classifier.classify_catalog`, `.env.local` Supabase service-role values, `siglip.load()` and `siglip.encode_text()`.
- Produces CLI: `purpose_backfill.py [--apply] [--limit N] [--threshold FLOAT] [--output DIR]`.
- Produces artifacts: `purpose-predictions.json`, `purpose-summary.csv`, and purpose/boundary contact sheets.
- Calls: `rpc/apply_siglip_album_purpose` only in apply mode.

- [ ] **Step 1: Write failing backfill safety tests**

Use mocked API responses and a mocked SigLIP text encoder. Verify:

Name the six test methods exactly `test_dry_run_never_posts_to_rpc`, `test_apply_calls_only_atomic_album_rpc`, `test_threshold_leaves_low_confidence_purpose_null`, `test_manual_reviewed_album_is_excluded_before_classification`, `test_limit_caps_album_writes_not_photo_rows`, and `test_output_contains_json_csv_and_contact_sheet_manifest`. Each test must assert the recorded HTTP method/path list and the exact generated file names rather than only checking a truthy return value.

- [ ] **Step 2: Run backfill tests and verify failure**

Run: `scripts/embed/.venv/bin/python -m unittest scripts.embed.test_purpose_backfill -v`

Expected: FAIL because `purpose_backfill.py` does not exist.

- [ ] **Step 3: Implement paginated, read-only input loading**

Fetch only:

```text
albums: id, title, description, admin_purpose_source, admin_purpose_reviewed, admin_purpose_version
photos: id, album_id, src_url, thumb_url, embedding, embedding_model, visibility,
        admin_purpose_source, admin_purpose_reviewed, admin_purpose_overridden
```

Require `visibility='published'`, non-null album IDs, non-null embeddings, and the current compatible embedding tag/dimension. Never select the forbidden tag/category columns.

- [ ] **Step 4: Implement dry-run artifacts**

Write deterministic JSON and CSV sorted by confidence descending. Download thumbnails only after classification and only for report contact sheets; classification itself must use stored embeddings. If a thumbnail fails, keep the prediction and record the image failure in the manifest.

- [ ] **Step 5: Implement explicit apply mode**

For each eligible prediction, pass the predicted purpose only when confidence meets `--threshold` and no conflict exists; otherwise pass null. Call one atomic album RPC per portfolio. `--limit` caps portfolio RPC calls. Print processed, classified, unclassified, excluded, and failed counts, then re-query coverage.

- [ ] **Step 6: Add purpose coverage to `check_db.py`**

Print album/photo counts for classified, unclassified, SigLIP, manual, reviewed, and photo overrides. Do not alter the existing embedding/mood checks.

- [ ] **Step 7: Run backfill and existing embed tests**

Run:

```bash
scripts/embed/.venv/bin/python -m unittest scripts.embed.test_purpose_classifier scripts.embed.test_purpose_backfill -v
scripts/embed/.venv/bin/python -m unittest discover -s scripts/embed -p 'test_*.py' -v
```

Expected: all tests PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add scripts/embed/purpose_backfill.py scripts/embed/test_purpose_backfill.py scripts/embed/check_db.py
git commit -m "feat: add purpose classification backfill"
```

---

### Task 4: Admin data contract and mutations

**Files:**
- Create: `src/lib/photo-purpose-admin.ts`
- Create: `src/lib/photo-purpose-admin.test.ts`
- Create: `src/app/(admin)/admin/photo-purpose/actions.ts`

**Interfaces:**
- Consumes: `PurposeKey`, `isPurposeKey`, service-role Supabase client, migration RPCs.
- Produces: `AdminPurposePhoto`, `AdminPurposeAlbum`, `groupPurposeRows(rows)`, `filterPurposeAlbums(albums, filter)`.
- Produces server actions: `setAlbumPurpose(albumId, purpose)`, `setPhotoPurpose(photoId, purpose)`, `clearPhotoPurposeOverride(photoId)`.

- [ ] **Step 1: Write failing grouping and filtering tests**

Cover portfolio grouping, null-album photos, unclassified filter, low-confidence filter, purpose filter, override count, and stable newest-first ordering.

```ts
test("unclassified includes albums with null purpose", () => {
  const albums = groupPurposeRows(rows);
  assert.deepEqual(filterPurposeAlbums(albums, { state: "unclassified" }).map((a) => a.id), ["a2"]);
});

test("photo overrides remain visible inside their portfolio", () => {
  const album = groupPurposeRows(rows).find((a) => a.id === "a1")!;
  assert.equal(album.photos.filter((p) => p.overridden).length, 1);
});
```

- [ ] **Step 2: Run admin core tests and verify failure**

Run: `npx tsx --test src/lib/photo-purpose-admin.test.ts`

Expected: FAIL because `photo-purpose-admin.ts` does not exist.

- [ ] **Step 3: Implement pure admin grouping/filtering helpers**

Keep database row conversion separate from React. The filter type is:

```ts
export type PurposeFilter = {
  state: "all" | "unclassified" | "auto" | "reviewed" | "low-confidence";
  purpose: PurposeKey | "all";
  photographer: string;
};
```

- [ ] **Step 4: Implement guarded server actions**

Each action calls `getCurrentUser()`, requires `role === 'admin'`, validates IDs and purpose codes, calls exactly one RPC, throws on Supabase error, and revalidates `/admin/photo-purpose`. No public user path is revalidated because purpose tags are not consumed there.

- [ ] **Step 5: Run admin core and purpose contract tests**

Run: `npx tsx --test src/lib/photo-purpose.test.ts src/lib/photo-purpose-admin.test.ts`

Expected: all tests PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/lib/photo-purpose-admin.ts src/lib/photo-purpose-admin.test.ts 'src/app/(admin)/admin/photo-purpose/actions.ts'
git commit -m "feat: add admin purpose classification actions"
```

---

### Task 5: Admin review workspace

**Files:**
- Create: `src/app/(admin)/admin/photo-purpose/page.tsx`
- Create: `src/app/(admin)/admin/photo-purpose/PhotoPurposeWorkspace.tsx`
- Modify: `src/app/(admin)/admin/AdminNav.tsx`

**Interfaces:**
- Consumes: `AdminPurposeAlbum`, `PURPOSE_OPTIONS`, and Task 4 server actions.
- Produces route: `/admin/photo-purpose` with menu label `사진 목적&무드`.

- [ ] **Step 1: Add the navigation route**

Insert `{ href: "/admin/photo-purpose", label: "사진 목적&무드" }` next to the existing photo-management tabs.

- [ ] **Step 2: Implement server-side portfolio loading**

Page through published photos 1,000 at a time. Select only photo identity/image fields, new purpose fields, album title/description/new purpose fields, and photographer display name. Convert rows with `groupPurposeRows` and pass them to the client workspace.

- [ ] **Step 3: Implement the three-column workspace**

- Left: filters and portfolio queue with counts.
- Center: selected portfolio photo grid; overridden photos receive a visible `개별` badge.
- Right: seven-purpose selector, confidence/source/review state, portfolio apply button, selected-photo override button, and override reset button.

Use the existing admin design tokens (`bg-bg`, `bg-surface`, `border-line`, `text-muted`, `text-brand`) and collapse to one vertical column below the desktop breakpoint. User-facing components must not import this workspace or purpose types.

- [ ] **Step 4: Add optimistic updates with rollback**

Update local album/photo state immediately, disable busy controls, call the server action, and restore the previous snapshot on failure. Surface the error next to the editor rather than swallowing it.

- [ ] **Step 5: Verify TypeScript, lint, and production build**

Run:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit Task 5**

```bash
git add 'src/app/(admin)/admin/AdminNav.tsx' 'src/app/(admin)/admin/photo-purpose'
git commit -m "feat: add admin photo purpose workspace"
```

---

### Task 6: Dry-run calibration, migration, and first backfill

**Files:**
- Modify: `docs/39-photo-purpose-taxonomy.md`
- Modify: `docs/superpowers/specs/2026-09-14-photo-purpose-classification-design.md`
- Runtime artifacts: `/private/tmp/samae-purpose-analysis/purpose-v1/`

**Interfaces:**
- Consumes: completed migration, classifier, batch, and admin workspace.
- Produces: selected automatic threshold, applied schema/data, coverage verification, and documented results.

- [ ] **Step 1: Run the full classifier in dry-run mode**

Run:

```bash
scripts/embed/.venv/bin/python scripts/embed/purpose_backfill.py \
  --output /private/tmp/samae-purpose-analysis/purpose-v1
```

Expected: no DB writes; JSON, CSV, and contact-sheet artifacts created.

- [ ] **Step 2: Inspect every purpose sheet and boundary sheet**

Record obvious false positives, median/majority conflicts, and top1/top2 margin at each failure. Choose the lowest threshold whose auto-applied set contains no observed obvious mismatch. Write that exact numeric value to `purposes.AUTO_THRESHOLD`. If no safe threshold exists for a purpose, remove that code from `purposes.AUTO_ENABLED` so it remains manual-only. Increment `VERSION` after either value changes.

- [ ] **Step 3: Snapshot protected existing fields before DB writes**

Use a read-only export keyed by photo/album ID for:

```text
photos: mood_tags, generated_tags, auto_mood_tags
albums: target_category_id
```

Save it under `/private/tmp/samae-purpose-analysis/purpose-v1/protected-before.json` without printing values or credentials to the console.

- [ ] **Step 4: Apply only migration `0113`**

Run: `node scripts/migrate.cjs 0113`

Expected: migration recorded once; columns, constraints, indexes, and four RPCs exist.

- [ ] **Step 5: Apply a limited backfill and verify**

Run:

```bash
scripts/embed/.venv/bin/python scripts/embed/purpose_backfill.py \
  --apply --limit 5 \
  --output /private/tmp/samae-purpose-analysis/purpose-v1/limited
python3 scripts/embed/check_db.py
```

Expected: no more than 5 albums changed; every changed album matches all non-overridden member photos; no manual/reviewed values changed.

- [ ] **Step 6: Apply the complete first backfill**

Run:

```bash
scripts/embed/.venv/bin/python scripts/embed/purpose_backfill.py \
  --apply \
  --output /private/tmp/samae-purpose-analysis/purpose-v1/applied
python3 scripts/embed/check_db.py
```

Expected: all eligible albums processed, high-confidence albums/photos classified, conflicts and low-confidence portfolios unclassified.

- [ ] **Step 7: Verify protected fields are unchanged**

Export the same protected fields to `protected-after.json` and compare keyed JSON values. Expected: zero differences for `mood_tags`, `generated_tags`, `auto_mood_tags`, and `target_category_id`.

- [ ] **Step 8: Smoke-test admin and public pages**

Open `/admin/photo-purpose`, filter unclassified and each purpose, set and clear one photo override, then restore its initial state. Verify `/`, `/c/couple`, `/explore`, search, and photo detail render without purpose text or a new visible tag.

- [ ] **Step 9: Record measured results**

Update both documents with threshold, target counts, classified/unclassified counts, purpose distribution, conflict count, model version, dry-run artifact path, migration status, protected-field diff result, and UI verification status.

- [ ] **Step 10: Run final verification**

Run:

```bash
scripts/embed/.venv/bin/python -m unittest discover -s scripts/embed -p 'test_*.py' -v
npx tsx --test src/lib/photo-purpose.test.ts src/lib/photo-purpose-admin.test.ts
node scripts/verify-migrations.cjs
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 11: Commit calibration and verification records**

```bash
git add docs/39-photo-purpose-taxonomy.md docs/superpowers/specs/2026-09-14-photo-purpose-classification-design.md scripts/embed/purposes.py
git commit -m "docs: record purpose classification rollout"
```
