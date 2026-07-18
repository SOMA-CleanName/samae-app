# 🛠 인스타 페르소나 매칭 — 이벤트 페이지 구현 계획 (MVP)

> 기획서 [`instagram-persona-matching.md`](./instagram-persona-matching.md) v0.2의 **Phase 1 MVP**를 실제로 붙이기 위한 구현 계획.
> 전제: `woori-mirae`(우리미래)로 **스크래퍼·심리 분석 하네스가 이미 검증**됨 → 기획서 §15-4의 미검증 리스크 해소.

| 항목 | 내용 |
|---|---|
| 문서 상태 | build-plan v0.1 (2026-07-18) |
| 배치 위치 | `samae-app` 안 이벤트 라우트 `/event/persona` (확정) |
| 결과 화면 | 전용 결과 화면 — 심리 프로파일 + "왜 이 사진" 논리적 근거 + 심리 후킹 (확정) |
| 코드 재사용 | `woori-mirae` 스크래퍼·하네스 포팅 + `samae-app` taste v2 추천 재사용 |

---

## 1. 재사용 자산 인벤토리

### 1-1. woori-mirae에서 포팅 (별도 repo `~/Documents/git/woori-mirae`)
| 파일 | 역할 | 처리 |
|---|---|---|
| `src/lib/instagram/scrape.ts` | Apify 스크래퍼 + **Mock 모드 내장**(`IG_MOCK=true`/토큰없음) | 그대로 포팅 |
| `src/lib/instagram/types.ts` | `IgProfile` / `IgPost` 타입 | 그대로 포팅 |
| `src/app/api/img/route.ts` | 인스타 CDN 이미지 프록시(핫링크 우회) | 그대로 포팅 |
| `src/lib/report/generate.ts` | Claude structured output 호출 스캐폴딩 | 재사용(2-stage 구조 차용) |
| `src/lib/report/persona.ts` + `schema.ts`(PersonaSchema) | 심리 프로파일(Big5·애착·evidence) | **Stage1 그대로 재사용** |

### 1-2. samae-app 기존 자산 (이미 구현됨)
| 자산 | 위치 | 역할 |
|---|---|---|
| taste v2 개인화 | `src/lib/category-constants.ts`, `taste-purposes.ts` | `samae_taste2` 쿠키 → 홈 피드 부스트/다운랭크 |
| 목적 taxonomy | `PURPOSE_OPTIONS` (`wedding`/`couple`/`personal`) | Stage2 매핑 타겟 |
| 무드 태그 | `photos.mood_tags` (필름/내추럴/에디토리얼…) | Stage2 매핑 타겟 |
| 상담 전환 | 기존 사진 상세 → [무료로 상담 신청하기] | 결과 화면에서 재사용 |

---

## 2. 상세 설계 — "데이터 정제 → 서비스 끼워맞추기"

전체 흐름은 **3단(정제 → 심리분석 → 서비스 매핑)**. 앞 2단은 woori-mirae에서 검증된 것 그대로, 마지막 1단만 신규.

```
[username] → 스크래핑(Apify/Mock) → IgProfile
   │
   ├─(A) 데이터 정제  [metrics.ts 포팅]      ← "입맛에 맞게 정제"
   │      IgProfile → ProfileMetrics (정량 신호만, 해석 안 함)
   │
   ├─(B) Stage1 심리분석  [persona.ts 재사용]
   │      Metrics + 이미지 3장(base64) → PersonaSchema
   │
   └─(C) Stage2 서비스 매핑  [★ NEW]          ← "우리 서비스에 끼워맞추기"
          Persona + Metrics + 런타임 무드목록 → ShootPersona
          → samae_taste2 쿠키 → 개인화 피드 + 결과화면
```

### (A) 데이터 정제 — `ProfileMetrics` (LLM 없이 코드로)
스크랩 원본에서 성격·미감 **신호**만 뽑고 해석은 미룸(단정 방지). 이미 `metrics.ts`가 계산:

| 신호군 | 지표 | 무엇을 읽나 |
|---|---|---|
| 게시 리듬 | 주당 빈도·평균간격·규칙성·최장공백 | 성실성/꾸준함 |
| 상호작용 | 평균 좋아요·댓글·참여율·댓글÷좋아요 | 소통 성향 |
| 소셜 그래프 | 팔로잉/팔로워 비 | 관계 지향(넓게 vs 선택적) |
| 표현 | 캡션 길이·이모지·해시태그·느낌표/물음표율·무캡션율 | 외향/표현성 |
| 콘텐츠 구성 | 영상비율·위치태그율·주제다양성·상위태그·상위장소 | 라이프스타일/개방성/이동성 |

→ **미감 신호(톤·필름/디지털·피사체·씬)는 이미지 3장을 Stage에서 비전으로 읽어 보강.**

### (B) Stage1 — 심리 페르소나 (재사용, 손 안 댐)
`Metrics(텍스트) + 이미지 base64` → `PersonaSchema { oneLiner, bigFive(Big5), attachment(애착), loveStyle, values, lifestyle, socialTendency, evidence[] }`.
`evidence`는 **"신호 → 해석"** 형식 → 결과화면 "왜 이 사람인지" 근거로 그대로 사용.

### (C) Stage2 — 촬영 페르소나 & samae 매핑 (★ 신규, 유일한 net-new)

**입력**
- Stage1 `Persona` + `ProfileMetrics` + 대표 이미지
- 🔑 **런타임 로드**: 현재 공개 무드 카테고리 `[{id, title}]` (DB `explore_categories kind='mood'`) + 목적 3종(`PURPOSE_OPTIONS`)
  → 무드는 어드민이 관리하므로 하드코딩 금지. LLM은 **주어진 목록 안에서만** 고름.

**출력 스키마 `ShootPersonaSchema`**
```ts
{
  shootPersonaLabel: string,        // "감성 필름 도심 산책러"
  purposeKey: "wedding"|"couple"|"personal",
  moodIds: string[],                // 입력으로 준 무드 id 중에서만, 1~3개
  moodReasons: {                    // 각 무드 선택 근거 (심리+미감 결합)
    moodTitle: string, signal: string, why: string
  }[],
  colorPalette: string[],           // hex 3~5
  shootTypes: string[], locations: string[],
  psychHook: string,                // 심리 자극 후킹 카피
}
```

**매핑 규칙(Stage2 프롬프트 골자)**
- `purposeKey`: 커플 2인 반복↑→`couple` · 웨딩/드레스 신호→`wedding` · 셀피·단독 인물↑→`personal`(기본값).
- `moodIds`: **비전 톤**(따뜻/필름/다크/미니멀) × **심리**(개방성↑→에디토리얼, 정서안정↑→내추럴/데일리)를 **주어진 무드 title의 의미와 매칭**.
- `moodReasons`: 각 항목에 **실제 신호 인용 강제**(metrics·evidence에서). 예: `{ signal:"피드 78%가 따뜻한 자연광·필름 톤", why:"밝고 부드러운 감성필름 무드가 어울려요" }`.
- 톤: 바넘 금지, 근거 기반. `psychHook`은 심리를 건드리되 단정·평가 금지.

**출력 검증**: `moodIds`가 입력 목록에 없으면 → 서버에서 필터 + 부족하면 1회 재시도(woori-mirae의 재시도 패턴 재사용).

### 서비스 끼워맞추기 (전환 배선)
```
ShootPersona.purposeKey + moodIds
  → serializeTasteV2(purposeKey, purposeIds, moodIds)   // category-constants.ts 재사용
  → 응답에 Set-Cookie: samae_taste2
  → 홈(/) 이동 시 기존 taste v2 피드가 자동 개인화(부스트/다운랭크)   ← 새 추천로직 0
```
- `purposeIds`: 목적→`categorySlugs`→id 해석(기존 로직). 비어도 `purposeKey`+`moodIds`로 개인화 동작.
- **결과화면 데이터 계약**: 서버액션이 `{ persona, shootPersona, recommendedPhotos[] }` 반환.
  `recommendedPhotos` = `moodIds` 카테고리 사진 6~9장(`fetchExploreCategoryGalleryPhotos` 재사용) → 전용 그리드.

**핵심**: Stage2가 `purposeKey`+`moodIds`만 뱉으면 추천·전환은 전부 기존 자산이 처리. **신규 추천 로직 없음.**

---

## 3. 라우트 & 파일 구조 (samae-app)

```
src/app/(user)/event/persona/
  page.tsx                 // 랜딩(username 입력) — 이벤트성 히어로
  loading 연출              // "피드 톤 읽는 중…" 애니
  result/[id]/page.tsx     // 전용 결과 화면 (심리+근거+추천사진+공유CTA)
  actions.ts               // 서버액션: 분석 트리거, 쿠키 세팅

src/lib/persona/
  scrape.ts                // ← woori-mirae 포팅
  types.ts                 // ← woori-mirae 포팅
  psychology.ts            // ← Stage1 재사용(PersonaSchema)
  shoot-persona.ts         // ★ Stage2 신규 (심리→samae 태그 매핑)
  map-to-taste.ts          // ★ ShootPersona → samae_taste2 직렬화

src/app/api/ig-img/route.ts // ← woori-mirae 이미지 프록시 포팅
```

---

## 4. 청크 단위 로드맵 (커밋 단위)

- **청크 1 — 스크래퍼·타입 포팅 + Mock 검증**
  `feat: 페르소나 이벤트 — 인스타 스크래퍼·타입 포팅(Mock 모드)`
  → 토큰 없이 Mock으로 파이프라인 end-to-end 확인.
- **청크 2 — Stage1 심리 하네스 재사용**
  `feat: 페르소나 이벤트 — 심리 프로파일 분석(Big5·애착·근거)`
- **청크 3 — Stage2 촬영 페르소나 매핑(신규) + taste2 연결**
  `feat: 페르소나 이벤트 — 촬영 페르소나·무드 매핑 → 개인화 연결`
- **청크 4 — 입력 랜딩 페이지 + 로딩 연출**
  `feat: 페르소나 이벤트 — username 입력·분석 로딩 UI`
- **청크 5 — 전용 결과 화면 (심리+근거+추천사진)**
  `feat: 페르소나 이벤트 — 결과 화면(심리 서술·추천 근거·어울리는 사진)`
- **청크 6 — 공유카드(1080×1920) + 전환 CTA**
  `feat: 페르소나 이벤트 — 공유카드·상담 전환 연결`
- **청크 7 — fallback(비공개/실패 시 사진 직접 업로드)**
  `feat: 페르소나 이벤트 — 스크래핑 실패 fallback 업로드`

---

## 5. 오픈 퀘스천 (진행 중 결정)

1. **Apify 토큰**: samae-app에 `APIFY_TOKEN` 넣을지 / 초기엔 Mock+수동 검증만 할지?
2. **결과 저장**: 결과 화면 공유용 `id` 영속 저장(Supabase) vs 쿠키/URL 임시?
3. **무드 매핑 소스**: Stage2가 매핑할 `moodIds` 실제 값 목록 — 현 `mood_tags` 실데이터에서 taxonomy 확정 필요.
4. **비로그인 허용 범위**: 결과까지 비로그인 OK, 상담 시 로그인(기획서 방침) 유지?
5. **이벤트 노출**: 앱 내 진입점(배너) 위치 / 인스타 광고 랜딩 직결?

---

## 6. 리스크 (기획서 §11 대비 변경점)

- ✅ 스크래핑 안정성·분석 유효성 → woori-mirae로 완화됨.
- ⚠️ 남는 핵심 리스크: **Stage2 매핑 품질**(심리→무드가 겉돌지 않게) + **원가 상한**(바이럴 시 레이트리밋·캐시 필수).
- ⚠️ Apify **익명·대규모** 수집 단가/차단율은 여전히 실측 필요(기획서 §15-4).

---

*본 계획은 기획서 v0.2 기반이며, 우리미래 검증 자산을 재활용하는 것을 전제로 한다. 다음 액션: 청크 1(스크래퍼 포팅)부터.*
