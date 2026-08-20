# 23. 촬영 페르소나 파이프라인

인스타 아이디(또는 사진 업로드) → 심리·촬영 페르소나 + **내 사진과 닮은 사매 사진** 추천.
바이럴 이벤트 기능이자, [22 시각 유사도](22-visual-similarity.md) 임베딩 인프라의 첫 번째 실소비처.

> 여기 있는 숫자는 전부 2026-08-20 실측이다. 성능·품질을 건드릴 때는 감이 아니라
> §5 의 하네스로 먼저 재고, 근거를 날짜와 함께 코드 주석에 남긴다.

---

## 1. 파이프라인

```
username ─► Apify 스크래핑 (~8s, 캐시 72h)
              │
              ▼
        피드 20개에서 등간격 9장 표집 → 512px 축소 (~1.3s)
              │
              ├────────────────► ① LLM 병합 호출 1회 (haiku-4.5, ~16s)
              │                    심리 프로파일 + 무드 매핑 + 카피
              │                    (src/lib/persona/combined.ts)
              │
              ├─(병렬, LLM 뒤에 숨음)─► ② 로컬 SigLIP 임베딩 (~1.1s)
              │                    → pgvector kNN → 닮은 사진 9장
              │                    (embed.ts → similar.ts → RPC 0079)
              │
              └─(병렬)─► ③ 팔레트 추출 (sharp, 11ms)
                           (palette.ts)
```

총 응답시간 **~25s** (스크래핑 8 + 준비 1.3 + LLM 16). 동시 8건까지 열화 ~4s.

## 2. 왜 이 구조인가 — 기각한 안들

| 안 | 결과 | 기각 이유 |
|---|---|---|
| 2단계 LLM (Stage1 심리 → Stage2 무드) | 61s | 같은 사진을 두 번 업로드. Stage2 는 사진을 아예 못 보고 텍스트 요약만 받아 무드 근거가 바넘 문장(캡션 길이·게시 간격)이었다 |
| 로컬 VLM (qwen3-vl:30b, 맥미니) | 40s/6장 | 이미지 입력 처리만 20~26s. 해상도·모델을 낮추면 시각근거 2/3 → 0/3 붕괴 |
| LLM 에게 colorPalette 요청 | — | 사진에 없는 CSS 색이름(#F0F8FF 등)을 지어냄. 픽셀 추출(11ms)로 대체 |
| 평균 벡터 1회 kNN | — | 씨앗이 다양하면 평균이 뭉개져 **입력이 뭐든 같은 사진 세트**가 나옴. 씨앗별 검색+거리순+앨범·씨앗 상한으로 교체 |

## 3. 지연 최적화 이력 (61s → 15.7s)

1. **병합 호출** — 이미지 중복 업로드 제거: 61 → 54s
2. **출력 슬림화** — 화면이 안 읽는 필드(loveStyle·values·lifestyle·socialTendency·shootTypes·bigFive.note) 생성 중단: 54 → 37s. *병목은 입력이 아니라 출력 토큰 생성이었다*
3. **모델 하향** — opus-4-8 → haiku-4.5: 37 → 15.7s

모델 비교(동일 입력 2프로필 × 반복, `scripts/persona-model-sweep.sh`):

| 모델 | 지연 | 시각근거 |
|---|---|---|
| opus-4-8 | 33.5s | 100% |
| sonnet-5 | 21.2s | 100% |
| **haiku-4.5 (채택)** | **16.3s** | **100%** |

⚠️ haiku 는 스키마에 `moodIds min(2)` 와 signal 서술 요건을 박기 전에는 75%까지 떨어졌다.
**값싼 모델은 프롬프트 문장 지시를 흘린다 — 개수·형식 제약은 스키마로 강제할 것.**

## 4. 로컬 임베딩 서비스 (맥미니)

- `scripts/embed/serve.py` — SigLIP2 NaFlex 상주 서비스 (포트 8077, venv: `scripts/embed/.venv`)
- 앱은 `PERSONA_EMBED_URL` 로 호출. **비어 있거나 죽어 있으면 무드 큐레이션으로 폴백** — 임베딩은 추천을 좋게 만드는 것이지 분석의 필수 조건이 아니다.
- 마이크로 배칭: 대기 중 요청을 한 번의 encode 로 흡수. 8건 동시 최장 3.8s.
- ⚠️ **MPS 텐서를 파이썬에서 원소 순회하지 말 것** — 원소마다 디바이스 동기화가 걸린다.
  응답 직렬화에서 이 실수로 11s 가 새고 있었다 (`tolist()` 로 한 번에 옮겨 해결).
- Vercel 배포 시 이 서비스에 닿으려면 터널(Tailscale funnel 등)이 필요하다. 미해결 — 닿지 않으면 폴백이라 배포 자체는 안전.

## 5. 평가 하네스 — "증상 없는 처방은 하지 않는다"

| 스크립트 | 재는 것 |
|---|---|
| `scripts/persona-eval.mts` | 무드 적중(배타 사진 기반 정답) · 시각근거 비율 · 더미 캡션 노이즈 |
| `scripts/persona-model-sweep.sh` | 모델별 지연·품질 반복 측정 (IG_MOCK dev 서버 필요) |
| `scripts/persona-contact-sheet.mts` | 추천 품질을 **눈으로** — 씨앗/추천 나란히 PNG |
| `scripts/persona-embed-e2e.mts` | 임베딩→kNN 전 구간 수치 |

하네스 설계에서 배운 함정 두 가지:
- **무드 태그 일치율은 대리지표다.** 필름-빈티지와 내추럴의 사진이 9/9 겹쳤다 — 배타 사진만 정답으로 인정해야 한다. 그리고 시각적으로 옳은 추천도 태그가 다르면 오답으로 세므로, 최종 판정은 콘택트 시트로 눈으로 한다.
- **더미 캡션을 근거로 들면 그건 노이즈 반응이다.** 평가용 캡션은 일부러 무의미하게 넣는다("오늘", "-"). 이걸 인용하는 모델은 사진을 안 보고 있는 것.

최종 게이트(2026-08-20): 적중 5/5 · 시각근거 10/10 · 노이즈 0/10 · 15.7s.

## 6. 입구 확인 카드 · 근거 썸네일 (2026-08-20 추가)

- **계정 확인 카드** — 타이핑이 멈추면(600ms) `lookup.ts` 가 인스타 비로그인
  `web_profile_info` 로 프로필을 조회해 카드를 띄운다. 공개→탭하면 분석,
  비공개→업로드 안내, 미존재→오타 경고. **오타·비공개로 Apify+LLM 을 태우는 것을 입구에서 차단.**
  - ⚠️ Node fetch(undici)는 `sec-fetch-mode` 를 어중간하게 붙여 인스타가
    "SecFetch Policy violation"(400) 을 낸다 — Sec-Fetch 3종을 same-origin 으로 명시해야 통과.
  - 조회 실패(차단 등)시 카드 없이 기존 흐름 폴백. 편의 기능이지 필수 관문이 아니다.
- **근거 썸네일** — LLM 이 moodReason 마다 근거 사진 번호(`photoIndexes`)를 내고,
  결과 화면이 그 번호의 실제 피드 썸네일(128px, `sampleThumbs`)을 카드에 붙인다.
  프롬프트에서 사진마다 "사진 N:" 라벨을 인터리브해야 번호 참조가 정확해진다.
  썸네일은 DB 에 저장하지 않는다 → 캐시 히트·공유 링크에서는 자연히 생략된다.
- `?u=아이디` 딥링크 — 입력 프리필 (광고·DM 용).
- 인터랙티브 UI 검증: `scripts/persona-ui-probe.mts` (CDP). **주의: 헤드리스+dev 모드는
  하이드레이션이 안 되는 경우가 있다 — 반드시 `next start` 프로덕션 모드로 검증할 것.**

## 7. 관련 파일

- 입구 조회: `lookup.ts` · 오케스트레이터: `src/lib/persona/analyze.ts` (단계별 지연 로그 `[persona]` 포함)
- LLM: `combined.ts` · 텍스트 조립: `psychology.ts`
- 임베딩 클라이언트: `embed.ts` · 유사 검색: `similar.ts` · 팔레트: `palette.ts`
- RPC: `supabase/migrations/0079_similar_photos_by_vector.sql` (service_role 전용)
- 결과 저장·공유: `store.ts` + `persona_results` 테이블 (0077, 캐시 72h·레이트리밋 5회/h)
- UI: `src/app/(user)/event/persona/` · 진입 카드: `explore/PersonaTestCard.tsx`
- 개발 프리뷰: `/event/persona/preview` (`?view=loading|run`, 프로덕션 404)
