# SigLIP2 Text Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 검색어를 SigLIP2 텍스트 임베딩으로 변환해 기존 사진 임베딩과 가까운 사진을 보여준다.

**Architecture:** 맥미니 상주 서비스에 인증된 `/embed-text`를 추가하고 Next.js 서버가 이를 호출한다. 반환된 1152차원 벡터를 기존 `similar_photos_by_vector` RPC에 전달한 뒤, RPC 거리순을 보존해 공개·승인·비숨김 사진 메타데이터를 조회한다.

**Tech Stack:** Python 3.12, SigLIP2/Transformers/PyTorch, Next.js 16, TypeScript, Supabase/Postgres pgvector, Node test runner

**Spec:** `docs/29-siglip-text-search.md`

## Global Constraints

- 모델은 `google/siglip2-so400m-patch16-naflex`로 고정한다.
- 문자열 점수와 벡터 거리를 수치로 가중합하지 않는다. 사진 메타데이터 직접 일치 결과를 우선하고, 코사인 거리·앨범 정보를 보존한 뒤 공통 다양성 규칙으로 뭉침만 해소한다.
- 화면에 순위 숫자를 표시하지 않는다.
- 검색창은 홈 히어로 바로 아래, 검색 결과 상단, 사진 상세 대표 사진 위에 배치한다.
- 신규 DB 테이블·컬럼·인덱스·함수를 만들거나 적용하지 않는다.
- 운영 DB에 `similar_photos_by_vector`가 없으면 구현을 멈추고 사용자에게 보고한다.
- 맥미니 장애가 홈 일반 피드와 사진 상세 추천에 영향을 주지 않아야 한다.

---

### Task 1: SigLIP2 텍스트 임베딩 엔드포인트

**Files:**
- Modify: `scripts/embed/serve.py`
- Create: `scripts/embed/test_serve_text.py`

**Interfaces:**
- Consumes: `siglip.encode_text(processor, model, texts, device)`
- Produces: `validate_texts(value) -> list[str]`, `embed_texts(texts) -> tuple[list[list[float]], float]`, `POST /embed-text`

- [x] **Step 1: 입력 검증 실패 테스트 작성**

```python
def test_validate_texts_rejects_empty_and_long_values(self):
    with self.assertRaises(ValueError):
        serve.validate_texts([])
    with self.assertRaises(ValueError):
        serve.validate_texts(["x" * 121])
```

- [x] **Step 2: 테스트가 실패하는지 확인**

Run: `scripts/embed/.venv/bin/python -m unittest scripts.embed.test_serve_text -v`

Expected: `AttributeError: module 'scripts.embed.serve' has no attribute 'validate_texts'`

- [x] **Step 3: 입력 검증과 텍스트 추론 함수 구현**

```python
MAX_TEXTS = 8
MAX_TEXT_LEN = 120
_infer_lock = threading.Lock()

def validate_texts(value):
    if not isinstance(value, list) or not value or len(value) > MAX_TEXTS:
        raise ValueError(f"texts는 1~{MAX_TEXTS}개 배열이어야 합니다")
    texts = []
    for value_item in value:
        if not isinstance(value_item, str):
            raise ValueError("검색어는 문자열이어야 합니다")
        text = value_item.strip()
        if not text or len(text) > MAX_TEXT_LEN:
            raise ValueError(f"검색어는 1~{MAX_TEXT_LEN}자여야 합니다")
        texts.append(text)
    return texts

def embed_texts(texts):
    t = time.perf_counter()
    with _infer_lock:
        vectors = siglip.encode_text(
            _state["processor"], _state["model"], texts, _state["device"]
        )
    return vectors.cpu().tolist(), (time.perf_counter() - t) * 1000
```

이미지 워커의 `siglip.encode()`도 같은 `_infer_lock`으로 감싸 MPS 동시 실행을 막는다.

- [x] **Step 4: `/embed-text` 라우팅 구현**

`/embed`의 prefix와 충돌하지 않게 `/embed-text`를 먼저 분기하고 다음 응답을 반환한다.

```python
self._send(200, {
    "count": len(vectors),
    "dim": len(vectors[0]),
    "infer_ms": round(ms, 1),
    "model": siglip.MODEL_ID,
    "vectors": [[round(x, 6) for x in row] for row in vectors],
})
```

- [x] **Step 5: 정상 추론 테스트 작성 및 실행**

`siglip.encode_text`를 mock tensor로 교체해 trim된 검색어, 1152차원 응답, 모델명을 검증한다.

Run: `scripts/embed/.venv/bin/python -m unittest scripts.embed.test_serve_text -v`

Expected: 모든 테스트 `OK`

- [x] **Step 6: Task 1 커밋**

```bash
git add scripts/embed/serve.py scripts/embed/test_serve_text.py
git commit -m "feat: SigLIP2 텍스트 임베딩 API 추가"
```

### Task 2: Next.js 벡터 검색 경로

**Files:**
- Create: `src/lib/siglip-text-search-core.ts`
- Create: `src/lib/siglip-text-search-core.test.ts`
- Create: `src/lib/siglip-text-search.ts`

**Interfaces:**
- Produces: `parseTextEmbeddingResponse(value): number[] | null`
- Produces: `orderByVectorIds<T extends {id: string}>(rows, orderedIds): T[]`
- Produces: `searchPhotosBySiglip(query: string, limit?: number): Promise<GalleryPhoto[]>`

- [x] **Step 1: 응답 검증과 순서 보존 실패 테스트 작성**

```ts
test("accepts exactly one normalized 1152-dimensional vector", () => {
  const vector = Array.from({ length: 1152 }, (_, index) => index / 1152);
  assert.deepEqual(parseTextEmbeddingResponse({ vectors: [vector] }), vector);
  assert.equal(parseTextEmbeddingResponse({ vectors: [[1, 2]] }), null);
});

test("preserves RPC distance order after metadata fetch", () => {
  const rows = [{ id: "b" }, { id: "a" }, { id: "c" }];
  assert.deepEqual(orderByVectorIds(rows, ["c", "b"]), [{ id: "c" }, { id: "b" }]);
});
```

- [x] **Step 2: 테스트가 실패하는지 확인**

Run: `node --experimental-strip-types --test src/lib/siglip-text-search-core.test.ts`

Expected: 모듈 또는 export가 없어 실패

- [x] **Step 3: 순수 함수 최소 구현**

`EMBED_DIM = 1152`를 사용해 유한 숫자 여부까지 검사하고, ID→row Map으로 RPC 순서를 복원한다.

- [x] **Step 4: 순수 함수 테스트 통과 확인**

Run: `node --experimental-strip-types --test src/lib/siglip-text-search-core.test.ts`

Expected: 모든 테스트 통과

- [x] **Step 5: 서버 전용 검색 구현**

`searchPhotosBySiglip()`은 다음 순서로 동작한다.

```ts
const vector = await embedSearchText(query);
if (!vector) return [];
const { data: nearest, error } = await admin.rpc("similar_photos_by_vector", {
  p_embedding: JSON.stringify(vector),
  p_limit: Math.min(Math.max(limit, 1), 300),
});
if (error) return [];
const ids = nearest.map((row) => row.id);
const { data: photos } = await admin
  .from("photos")
  .select("id, src_url, thumb_url, width, height, region, mood_tags, price_krw, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name, status)")
  .in("id", ids)
  .eq("visibility", "published")
  .eq("feed_hidden", false)
  .eq("photographer.status", "approved");
return orderByVectorIds(photos ?? [], ids);
```

임베딩 요청은 `PERSONA_EMBED_URL`, `PERSONA_SERVICE_TOKEN`, 4초 타임아웃을 사용한다. URL이 없거나 HTTP 오류·차원 오류가 발생하면 빈 배열을 반환한다.

- [x] **Step 6: 타입 검사**

Run: `npx tsc --noEmit`

Expected: exit code 0

- [x] **Step 7: Task 2 커밋**

```bash
git add src/lib/siglip-text-search-core.ts src/lib/siglip-text-search-core.test.ts src/lib/siglip-text-search.ts
git commit -m "feat: SigLIP2 검색어 벡터 검색 연결"
```

### Task 3: 검색창과 검색 결과 UI

**Files:**
- Create: `src/components/user/SearchPill.tsx`
- Create: `src/lib/search-navigation.ts`
- Create: `src/lib/search-navigation.test.ts`
- Modify: `src/app/(user)/page.tsx`
- Modify: `src/components/user/ExploreGallery.tsx`

**Interfaces:**
- Consumes: `searchPhotosBySiglip(query, 300)`
- Produces: `<SearchPill initial?: string />`
- Produces: `searchHref(rawQuery: string): string`

- [x] **Step 1: 검색 URL 실패 테스트와 최소 구현**

`searchHref("  푸른 숲속 커플 사진  ")`이 인코딩된 `/?q=`를, 공백만 있는 값은 `/`를 반환하는 테스트를 먼저 실패시킨 뒤 구현한다.

Run: `node --experimental-strip-types --test src/lib/search-navigation.test.ts`

Expected: 2개 테스트 통과

- [x] **Step 2: 현재 문자열 검색 호출을 SigLIP2 검색으로 교체**

`src/app/(user)/page.tsx`의 검색 분기에서 메타데이터 직접 일치와 `searchPhotosBySiglip(query, 300)` 결과를 함께 구성한다. 일반 홈 피드 분기는 변경하지 않는다. 검색 결과는 `ExploreGallery`의 센티넬로 48장씩 노출하고, 고유 후보 소진 뒤에는 같은 풀을 사이클별 새 순서로 반복한다.

- [x] **Step 3: 검색창 컴포넌트 복원**

```tsx
export function SearchPill({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initial);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/?q=${encodeURIComponent(value)}` : "/");
  }
  return <form onSubmit={submit}>{/* SearchIcon + input */}</form>;
}
```

입력에는 `aria-label="사진 분위기 검색"`을 사용한다. 플레이스홀더는 공개 사진에서 함께 자주 쓰이는 한국어 태그 조합 중 하나를 요청마다 고르고, 별도의 하단 예시 문장은 표시하지 않는다. 검색창은 `rounded-md`이며 호버·포커스 시 브랜드 빨강 테두리 광택의 앞쪽 끝이 실제 SVG 외곽선의 왼쪽 위 모서리에서 출발한다. 1.5초 동안 테두리를 한 바퀴 완전히 돌아 앞쪽 끝이 다시 왼쪽 위 모서리에 도착한 뒤 이동 없이 사라진다. 이 모션은 컴포넌트 인스턴스당 최초 1회만 실행한다. 돋보기는 기본 브랜드 빨강, 포커스 시 현재 테마의 본문색을 사용한다.

- [x] **Step 4: 지정된 위치에 검색창 배치**

- 일반 홈: `<FeedHero />` 바로 다음
- 검색 결과: 히어로 대신 페이지 최상단
- 사진 상세: 대표 사진 바로 위
- 카테고리 `/c/*`, 탐색 `/explore`에는 추가하지 않음

- [x] **Step 5: 빈 결과 안내 문구 수정**

검색 결과가 없을 때 `다른 장면이나 분위기로 검색해보세요. (예: 푸른 숲속 커플, 비 오는 날 필름 감성)`를 표시한다.

- [x] **Step 6: 정적 검증**

Run: `npx eslint src/components/user/SearchPill.tsx 'src/app/(user)/page.tsx' src/components/user/ExploreGallery.tsx src/lib/siglip-text-search.ts src/lib/siglip-text-search-core.ts`

Expected: exit code 0

Run: `npx tsc --noEmit`

Expected: exit code 0

- [x] **Step 7: Task 3 커밋**

```bash
git add src/components/user/SearchPill.tsx src/lib/search-navigation.ts src/lib/search-navigation.test.ts 'src/app/(user)/page.tsx' src/components/user/ExploreGallery.tsx
git commit -m "feat: 홈 SigLIP2 사진 검색창 복원"
```

### Task 4: DB 계약과 로컬 통합 검증

**Files:**
- Create: `scripts/check-siglip-text-search.cjs`
- Modify: `docs/29-siglip-text-search.md`

**Interfaces:**
- Consumes: `/embed-text`, `similar_photos_by_vector`
- Produces: 검색어별 모델명·임베딩 지연·상위 사진 ID/거리 출력

- [x] **Step 1: 읽기 전용 검증 스크립트 작성**

스크립트는 기본 검색어 세 개를 사용한다.

```ts
const queries = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["푸른 숲속 커플 사진", "어두운 실내 플래시 인물", "바다에서 뛰는 사람"];
```

각 검색어마다 `/embed-text`를 호출하고, 성공한 벡터로 `similar_photos_by_vector`를 `p_limit: 8`로 호출해 ID와 거리를 출력한다. `insert`, `update`, `delete`, DDL은 실행하지 않는다.

- [x] **Step 2: Python·TypeScript 단위 테스트 전체 실행**

Run: `scripts/embed/.venv/bin/python -m unittest scripts.embed.test_serve_text -v`

Run: `node --experimental-strip-types --test src/lib/siglip-text-search-core.test.ts`

Expected: 모두 통과

- [x] **Step 3: 운영 DB RPC 읽기 전용 확인**

Run: `node --env-file=.env.local scripts/check-siglip-text-search.cjs "푸른 숲속 커플 사진"`

Expected: `/embed-text` 모델명이 `google/siglip2-so400m-patch16-naflex`, 벡터 차원이 1152, RPC 결과가 1장 이상

RPC가 없다는 오류가 나오면 DB를 수정하지 않고 작업을 중단해 사용자에게 알린다.

- [ ] **Step 4: 로컬 브라우저 확인** — 자동 브라우저 연결 없음. HTTP·SSR·서버 로그 검증 완료, 실제 클릭·스크린샷은 수동 확인 필요.

Run: `npm run dev`

확인:

- `/`에서 히어로 아래 검색창이 보임
- 검색 제출 후 `/?q=`에서 상단 검색창만 보임
- `/photos/[id]`에서 대표 사진 위 검색창이 보임
- 결과가 메이슨리 그리드에 표시됨
- 화면에 순위 번호나 혼합 점수가 없음
- 뒤로가면 기존 홈 피드 위치가 복원됨

- [x] **Step 5: 문서 상태 갱신과 최종 커밋**

`docs/29-siglip-text-search.md`의 상태를 `로컬 구현·검증 완료, 배포 전`으로 바꾸고 실제 테스트 결과를 기록한다.

```bash
git add scripts/check-siglip-text-search.cjs docs/29-siglip-text-search.md
git commit -m "test: SigLIP2 텍스트 검색 통합 검증 추가"
```

### Task 5: 포트폴리오 메타데이터 직접 일치 보강

- [x] 사진 공개·숨김 태그, 앨범 제목·설명·장소, 작가 태그·지역의 직접 일치 결과만 조회
- [x] 메타데이터와 SigLIP 검색을 병렬 실행
- [x] 직접 일치 결과를 먼저 배치하고 ID 중복 제거 후 SigLIP 거리순 연결
- [x] 다단어 검색은 원문 단어를 모두 포함할 때만 메타데이터 결과 승격
- [x] 사진과 직접 연결되지 않은 패키지명·설명은 검색 대상에서 제외
- [x] `만삭` 직접 일치 6장 승격과 일반 자연어 SigLIP 순서 보존 검증

### Task 6: 검색 결과 다양성 재정렬

- [x] 벡터 RPC의 코사인 거리와 사진 앨범 ID를 최종 검색 후보까지 보존
- [x] 동일 앨범 사진이 최근 12장 안에 다시 나오지 않도록 분산하고, 후보가 부족하면 가장 오래전에 나온 앨범부터 재사용
- [x] 원본 관련도순을 48장 구간으로 나눠, 낮은 관련도 포트폴리오가 앨범 간격을 채우기 위해 앞 구간으로 승격되지 않도록 제한
- [x] 방향 의도가 없는 검색에서 방향별 후보 큐를 독립 순환해 매 48장마다 세로 36장·그 외 12장 고정
- [x] 최고 유사도 후보와 메타데이터 직접 일치 후보의 상단 우선순위 보호
- [x] `가로`·`세로`·`portrait`·`landscape` 등 방향 검색은 세로 비율 보정 제외
- [x] 홈·상세 유사사진 추천과 검색이 공통 다양성 재정렬기 사용

### Task 7: 관련도 기반 분산과 검색 무한 스크롤

- [x] 직접 일치 사진도 실제 SigLIP2 거리로 정렬해 유사도가 높은 사진을 상단에 보호
- [x] 48장 구간마다 직접 일치 최대 36장과 벡터 전용 최대 12장을 구성해 다른 포트폴리오가 분산 후보로 참여
- [x] 후보 한쪽이 부족하면 다른 후보로 채우고 최대 300개의 고유 후보를 48장씩 점진 노출
- [x] 고유 후보 소진 뒤에도 센티넬을 유지하고 사이클별 결정적 셔플로 48장씩 반복
- [x] 검색 메이슨리에서 같은 앨범의 좌우 높이 겹침과 세로 연속을 회피하고 일반 홈 배치는 유지
- [x] 열 높이가 반 장 이상 벌어지면 앨범 분산보다 짧은 열을 우선해 한쪽 열 공백 방지
- [x] `한복`·`가을` 첫 48장의 동일 앨범 좌우 겹침을 각각 10→0회, 13→0회로 확인
