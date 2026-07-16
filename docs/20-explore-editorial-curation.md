# 20 · 탐색 편집형 큐레이션 (Explore Editorial Curation)

> 상태: **설계안 (미실행)** · 작성 2026-07-15
> 결정: 광고 랜딩(`/c/[slug]`)과 **별도 체계** · 멤버십 **순수 수동(편집형)** · 진입 광고 연동은 2차

---

## 1. 배경 / 문제

현재 탐색(`/explore`)은 **코드 상수 태그 자동 분류**다.

- `src/lib/explore-categories.ts` — `EXPLORE_CATEGORIES` 20개가 하드코딩. 각 카테고리 = `mood_tags` 태그 묶음.
- `/explore` — published 사진 1000장을 `force-dynamic`으로 전량 로드 → JS `.filter`로 카테고리별 태그 매칭 → 가로 스트립.
- `/explore/[idx]` — 배열 **index**를 URL로 사용. 태그 `overlaps` 쿼리로 전체 노출.

**한계 (큐레이션 관점)**
1. 카테고리 추가·삭제·순서·이름 변경에 **개발자 배포 필요**.
2. URL이 배열 index라 순서만 바꿔도 기존 링크·북마크·광고 URL이 깨짐.
3. 멤버십이 태그 문자열 정확 일치라, 운영이 "이 사진을 이 카테고리에 넣자"를 **직접 못 함**.
4. 태그 안 달린 사진은 어느 카테고리에도 안 잡힘.

**원하는 것**: 운영이 어드민에서 **카테고리를 직접 만들고, 전체 published 사진에서 골라 담고, 순서·공개를 제어**한다. 태그 자동 매칭은 탐색에서 폐기.

> 참고: 기존 DB `categories` 테이블(광고 `/c/[slug]`)도 멤버십이 태그 기반이다. 이번 작업은 **그걸 건드리지 않고**, 탐색 전용 편집형 체계를 새로 만든다.

---

## 2. 목표 / 비목표

**목표**
- 어드민에서 탐색 카테고리 CRUD (이름·slug·공개·순서).
- 카테고리별로 **전체 published 사진에서 수동으로 골라 담기** + 담은 사진 순서 배치.
- `/explore`가 이 DB 데이터를 렌더. 상수 `EXPLORE_CATEGORIES` 폐기.
- URL을 index → **slug**로 전환(링크 안정성).

**비목표 (이번 범위 밖)**
- 광고 `/c/[slug]` 체계 변경 (그대로 둠).
- 태그 자동 매칭·개인화 정렬·검색 개편.
- 진입 광고(utm/캠페인)별 카테고리 노출 제어 → **2차**(§7에 훅만 남김).

---

## 3. 데이터 모델

새 마이그레이션 **`0060_explore_categories.sql`**. 광고용 `categories`와 분리된 두 테이블.

```sql
-- 탐색 편집형 카테고리 — 운영이 직접 만들고 사진을 손으로 담는다.
-- (광고 랜딩 categories 와 별개 체계.)
create table if not exists public.explore_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,               -- URL: /explore/<slug>
  title       text not null,                      -- 표시명: "일본 감성"
  subtitle    text not null default '',           -- 부제(선택)
  published   boolean not null default false,     -- 탐색 노출 여부
  sort        integer not null default 0,         -- 탐색 내 카테고리 정렬(오름차순)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_explore_categories_published
  on public.explore_categories (published, sort);

-- 멤버십 — 카테고리에 담긴 사진(수동). position 오름차순으로 노출.
create table if not exists public.explore_category_photos (
  category_id uuid not null references public.explore_categories(id) on delete cascade,
  photo_id    uuid not null references public.photos(id) on delete cascade,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  primary key (category_id, photo_id)
);

create index if not exists idx_ecp_category
  on public.explore_category_photos (category_id, position);

-- RLS: 공개 카테고리/그 멤버십은 누구나 조회, 관리는 운영자만
alter table public.explore_categories enable row level security;
alter table public.explore_category_photos enable row level security;

drop policy if exists explore_categories_select on public.explore_categories;
create policy explore_categories_select on public.explore_categories
  for select using (published or public.is_admin());

drop policy if exists explore_categories_admin on public.explore_categories;
create policy explore_categories_admin on public.explore_categories
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists ecp_select on public.explore_category_photos;
create policy ecp_select on public.explore_category_photos
  for select using (
    public.is_admin() or exists (
      select 1 from public.explore_categories c
      where c.id = category_id and c.published
    )
  );

drop policy if exists ecp_admin on public.explore_category_photos;
create policy ecp_admin on public.explore_category_photos
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists trg_explore_categories_updated on public.explore_categories;
create trigger trg_explore_categories_updated
  before update on public.explore_categories
  for each row execute function public.set_updated_at();
```

**설계 노트**
- `position`을 조인 테이블에 둬서 **담기 = 순서**를 한 번에 관리(기존 광고 `ordered_photo_ids` 배열보다 확장성 좋음: 사진 삭제 시 cascade, 대량에도 인덱스).
- 삭제된 사진은 `on delete cascade`로 자동 정리 → 읽는 쪽 정합성 검증 불필요.
- 커버 사진은 별도 컬럼 없이 `position=0` 첫 장을 대표로 사용(단순). 필요 시 후속에 `cover_photo_id` 추가.

---

## 4. 어드민 (`/admin/explore`)

새 라우트 `src/app/(admin)/admin/explore/`. `AdminNav`에 `{ href: "/admin/explore", label: "탐색" }` 추가(카테고리 아래).

**페이지 구성** (`categories/page.tsx` 패턴 재사용)
- 새 카테고리 생성 폼: 이름 · slug(비우면 자동) · 부제.
- 카테고리 목록 카드: 공개 배지 · `/explore/<slug>` · 담긴 사진 수 · 페이지 보기 ↗ · 공개/비공개 토글.
- 카드 내 펼침(details):
  - **🖼 사진 담기·순서** — 신규 `ExplorePhotoPicker` (§4.1).
  - **✏️ 편집·삭제** — 이름·slug·부제 수정, 삭제(ConfirmForm).
  - **↕ 카테고리 순서** — sort 조정(상/하 버튼 또는 목록 상단 DnD).

**서버 액션** `admin/explore/actions.ts` — `getCurrentUser()` + role 가드 후 `createAdminClient()` (기존 `categories/actions.ts` 동일 패턴):
- `createExploreCategory` / `updateExploreCategory` / `deleteExploreCategory`
- `toggleExplorePublished`
- `setExploreCategoryPhotos(categoryId, photoIds[])` — 조인 테이블 **전량 교체**(delete where category + insert with position=index). 담기+순서를 한 번에 저장.
- `reorderExploreCategories(idsInOrder[])` — sort 일괄 갱신.
- 각 액션 끝에 `revalidatePath("/admin/explore")` + `revalidatePath("/explore")`.

### 4.1 `ExplorePhotoPicker` (핵심 신규 컴포넌트)

기존 `CategoryPhotoOrder`의 **드래그 순서 UX를 재사용**하되, 후보 풀을 **태그 매칭 → 전체 published 사진**으로 바꾼다.

- **상단(담긴 존)**: 현재 카테고리에 담긴 사진 — DnD 재정렬(`@dnd-kit`, 이미 의존성 있음) · ✕ 제거 · position 뱃지. `CategoryPhotoOrder`의 `SortableThumb` 그대로.
- **하단(전체 풀)**: 전체 published 사진 그리드, 탭하면 담긴 존 맨 뒤 추가.
  - 물량이 크므로(수천 장) **서버 페이지네이션 + 필터 검색** 필수. 무한 스크롤 또는 "더 보기".
  - 필터: 작가명 · 지역(region) · 태그 텍스트 · 앨범. (읽기 전용 조회는 `createAdminClient` + 기존 `discovery`/`search` 쿼리 재사용.)
  - 이미 담긴 사진은 풀에서 회색/체크 표시.
- 저장: `setExploreCategoryPhotos` 서버 액션에 `photoIds` 순서대로 전송.

> **주의**: 기존 `fetchAdCandidates`는 `overlaps("mood_tags", tags)`로 **태그 스코프**다. 편집형은 이걸 쓰지 않고 전체 사진 조회 함수를 새로 만든다 (`fetchAllPhotosPaged({ q, region, photographerId, cursor })`). `discovery.ts`의 기존 페이지네이션 패턴 참고.

---

## 5. 프론트 (`/explore`, `/explore/[slug]`)

### 5.1 `/explore` (홈)
- `EXPLORE_CATEGORIES` 상수 → DB `explore_categories where published order by sort` 조회.
- 각 카테고리의 앞 N장(예: 10)을 `explore_category_photos order by position limit N` 조인 조회.
  - N+1 방지: 카테고리 id들로 한 번에 `in(...)` 조회 후 그룹핑, 또는 뷰/RPC.
- 시드 셔플 **제거** — 순서는 운영이 정한 `position`이 진실. (`seededShuffle`/`spaceByKey`/`dayKey` 이 경로에서 미사용.)
- 담긴 사진 4장 미만 카테고리는 계속 숨김(또는 어드민에서 비공개 처리로 대체).
- `ExploreStrip`은 그대로 재사용(저스티파이드 가로 행).

### 5.2 `/explore/[slug]` (개별)
- `[idx]` 디렉터리 → **`[slug]`** 로 교체. Next.js 16 동적 param 수동 디코딩 주의(`/c/[slug]`가 이미 `safeDecode` 처리 — 동일 적용).
- `explore_categories where slug` → 없으면 `notFound()`.
- 멤버십 사진 전체를 `position` 순으로 `ExploreGallery`(메이슨리) 렌더. 시드 정렬 제거.

### 5.3 링크·계측
- `page.tsx`의 `href={/explore/${idx}}` → `href={/explore/${slug}}`.
- `MpTrackOnce` 이벤트(`View Explore Feed`, `View Category`) 유지. `View Category` props의 `category`는 title 그대로.

---

## 6. 마이그레이션 / 데이터 이관

기존 상수 20개를 DB로 **1회 시드**(운영 편의). 두 방법:
- (A) `0060` 마이그레이션 하단에 `insert`로 20개 `explore_categories`만 생성(사진 미담김) → 운영이 어드민에서 사진 담기.
- (B) 마이그레이션은 스키마만, 시드는 어드민에서 수동 생성.

**권장 (A)**: 카테고리 껍데기 20개는 자동 생성(title·slug·sort·published=false), 사진은 편집형이라 운영이 채운다. slug는 title 기반 `slugify`(한글 → 로마자 or nanoid). published=false로 시작해 준비된 것만 공개.

> 상수 파일 `explore-categories.ts`는 프론트가 DB로 전환 완료된 뒤 **삭제**. 그 전까지 남겨 롤백 안전판.

---

## 7. 진입 광고 연동 (2차 · 훅만)

"진입 광고에 따라 노출 카테고리/사진 결정"은 별도 체계 결정으로 **이번 범위 밖**이나, 확장 여지를 남긴다:
- `explore_categories`에 `campaign_key text` 또는 `featured_until timestamptz` 추가 → `/explore?utm_campaign=…` 진입 시 해당 카테고리를 상단 고정/스포트라이트.
- 광고 착지는 여전히 `/c/[slug]`(광고 categories). 필요 시 광고 카테고리 ↔ 탐색 카테고리를 slug로 느슨히 매핑.
- 결정 필요: 진입 광고가 탐색 순서를 바꾸나, 아니면 특정 카테고리로 딥링크만 하나. → 2차에서 별도 논의.

---

## 8. 작업 순서 (청크)

로드맵/커밋 관례에 맞춘 단계. 각 청크 = feature 브랜치 + PR, 3줄 요약.

1. **DB — 탐색 편집형 스키마** (`0060`): 두 테이블·RLS·트리거·상수 20개 시드(껍데기).
2. **어드민 — 탐색 카테고리 CRUD**: `/admin/explore` 페이지·actions·AdminNav. (사진 피커 제외, 생성·공개·순서·삭제까지)
3. **어드민 — 전체 사진 피커**: `ExplorePhotoPicker` + `fetchAllPhotosPaged`(검색·필터·페이지네이션) + `setExploreCategoryPhotos`.
4. **프론트 — 탐색 DB 전환**: `/explore` DB 렌더, `[idx]`→`[slug]`, 시드 셔플 제거, 링크·계측 갱신.
5. **정리**: `EXPLORE_CATEGORIES` 상수 삭제, 문서 업데이트. (2차 훅 §7은 별도 이슈로)

---

## 9. 리스크 / 체크리스트

- [ ] `is_admin()`·`set_updated_at()` 함수가 존재하는지 확인(기존 마이그레이션에 있음 — 재사용).
- [ ] 전체 사진 피커 성능 — 수천 장. 반드시 서버 페이지네이션(클라 전량 로드 금지, `force-dynamic` 1000장 실수 반복 X).
- [ ] `/explore/[slug]` 한글 slug 디코딩(Next 16) — `/c/[slug]` 패턴 그대로.
- [ ] 사진 삭제 시 cascade 동작 확인(멤버십 자동 정리).
- [ ] 빈 카테고리(사진 0장) 공개 시 UX — 프론트 가드 또는 공개 시 경고.
- [ ] RLS 회귀 — 비공개 카테고리/멤버십이 비로그인·일반 유저에게 안 보이는지.
- [ ] dev/prod 분리(`docs/19`) 미실행 상태 — 시드/테스트는 프로덕션 데이터 주의.
```

---

## 11. 개정 (2026-07-16) — 사진→카테고리 방식으로 전환

초기 구현(§4.1 `ExplorePhotoPicker`)은 **카테고리에서 사진을 골라 담는** 방향이었으나,
운영 편의를 위해 **사진에서 카테고리를 등록하는(사진→다중 카테고리)** 방향으로 전환.

- **저장 모델 변경 없음** — `explore_category_photos`(다대다) 그대로 재사용. 검색 태그(`generated_tags`)와 분리된 전용 저장소.
- **새 어드민 `/admin/explore/assign`** — 사진을 **포트폴리오(앨범)별로** 묶어 보고, 상단에서 '담을 카테고리'를 고른 뒤 사진을 탭해 담기/빼기. 포트폴리오 단위 일괄 담기/빼기 지원.
  - `ExplorePhotoAssigner`(클라이언트) + 서버액션 `togglePhotoExploreCategory` / `addAlbumExploreCategory` / `removeAlbumExploreCategory` / `loadExploreAssignPage`.
  - 읽기: `fetchExploreAssignPhotos`(앨범·작가 메타 포함) + `getExploreMembershipsForPhotos`.
- **제거** — 카테고리→사진 피커(`ExplorePhotoPicker`)와 그 백엔드(`fetchExplorePhotoPool`·`setExploreCategoryPhotos`·`fetchPhotosByIds`).
- **`/admin/explore`**(카테고리 관리)는 CRUD·공개·순서만 담당하고, 사진 할당은 `/assign` 으로 링크.
- **`/explore` 프론트는 변경 없음** — 여전히 `explore_category_photos`(position 순)를 읽음.
- 참고: 이번 전환으로 카테고리 내 사진 **수동 정렬(DnD)** 은 빠졌고, position 은 담은 순서(append)로 정해진다. 필요 시 후속에 정렬 도구 추가.
