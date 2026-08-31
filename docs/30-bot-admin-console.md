# 봇 통합 관리 콘솔 — 기획 (2026-08-27)

> 선행: `docs/29-photo-detail-consult-booking.md` (답변 전용 봇으로 전환), `docs/23-inquiry-chat-system.md`.
> 이 문서는 **아직 구현 전 기획**이다. 합의된 뒤 단계별로 붙인다.

---

## 0. 문제

봇은 이제 손님이 작가를 만나기 전에 **가장 먼저 말을 거는 존재**다. 그런데 봇을 다루는
조작과 관측이 다섯 군데로 흩어져 있고, **그 어디에도 "봇이 지금 잘 하고 있나"에 답하는 화면이 없다.**

| 지금 있는 곳 | 무엇을 하나 | 문제 |
|---|---|---|
| `/admin/bot-kb` | 작가별 지식카드 등록 | 유일하게 제대로 있는 화면 |
| `/studio/bot` | 작가가 말투 + 추가질문 설정 | **말투(tone)가 상담봇에 전혀 안 들어간다** (§1) |
| `/admin/chats` | 대화 열람 · 검열 차단 기록 | 봇 관점 필터가 없다 (봇 턴/인계/미답변) |
| `bot_open_questions` | 봇이 못 답해 넘긴 질문 | **채팅방 안에서만 보인다 — 운영은 영영 못 본다** |
| 코드 | 프롬프트 · 공통정책 · 모델 | 바꾸려면 배포해야 한다 |

관측은 더 얇다. 봇이 몇 번 답했는지, 그중 몇 번이 근거 없어 작가에게 넘어갔는지,
LLM이 몇 번 실패했는지 — **어디에도 남지 않는다.** LLM 실패는 `console.error` 한 줄이 전부다.

---

## 1. 먼저 고쳐야 할 사실관계 (기획 이전의 버그)

답변 전용 봇으로 바꾸면서 생긴 구멍 두 개. 콘솔을 얹기 전에 정리해야 한다.

1. **작가 말투가 죽었다.** `photographer_bot_scripts.tone` 은 `buildSystemPrompt`(수집 모드)에만
   주입된다. 채팅방은 이제 `buildQaPrompt` 만 쓰는데 여기엔 tone 인자가 없다.
   → 작가가 스튜디오에서 말투를 저장해도 상담봇은 그대로다.
2. **`/studio/bot` 설명이 옛 모델이다.** "봇이 기본 정보(촬영 종류·희망일·지역·인원)를 여쭤봐요"
   라고 적혀 있지만, 이제 그건 예약 폼(`/inquiry`)이 한다. 추가질문도 폼으로 간다.
   → 작가가 페이지를 열면 사실과 다른 설명을 읽는다.

---

## 2. 핵심 통찰 — 이미 쌓이는데 아무도 안 보는 데이터

KB 품질을 올리는 자연스러운 루프가 **이미 데이터로 존재한다**:

```
손님이 물음 → 봇이 근거 없음(needsHuman) → bot_open_questions 에 기록
   → 작가가 답함 → answered_at 채워짐 → ...그리고 아무 일도 일어나지 않는다
```

작가가 방에서 답한 그 문장이 곧 **다음 손님을 위한 KB 카드**인데, 운영은 그 질문이
있었다는 사실조차 모른다. 이 고리를 잇는 것이 통합 관리의 1번 가치다.

```
[봇이 못 답한 질문] → 운영이 큐에서 봄 → 작가 답변을 카드로 승격 → 봇이 다음부터 답함
```

**콘솔의 성공 지표는 "화면이 예쁜가"가 아니라 "미답변 큐가 줄어드는가"다.**

---

## 3. 제안 — `/admin/bot` 통합 콘솔 (탭 4개)

`/admin/bot-kb` 를 `/admin/bot` 아래로 흡수한다. 어드민 내비는 `봇 지식(KB)` → `봇` 으로.

### 탭 1. 현황 (`/admin/bot`)
"봇이 지금 잘 하고 있나"에 한 화면으로 답한다. 최근 7일 기준.

- **응답 수** · **근거 답변률**(needsHuman 아닌 비율) · **인계율**(작가가 이어받은 방 비율) · **LLM 실패 수**
- **KB 커버리지**: 등록 작가 n / 전체 17명, 핵심 6주제 중 빈 곳
- **작가별 표**: 이름 · KB 장수 · 최근 7일 응답 · 근거 답변률 · 미답변 n · 마지막 갱신
  → 행 클릭 시 그 작가의 KB 편집으로

근거 답변률이 낮은 작가 = KB가 얇은 작가다. 여기서 바로 다음 할 일이 보여야 한다.

### 탭 2. 빈틈 (`/admin/bot/gaps`) ★ 가장 먼저 만들 것
`bot_open_questions` 전역 큐. **이 탭 하나가 나머지 셋보다 가치가 크다.**

- 미답변 질문 목록: 질문 · 작가 · 방 · 시각 · 작가가 답했는지
- 같은 취지 질문은 묶어서 보여준다 (같은 작가 + 유사 문구 → n건)
- 각 행 액션:
  - **[KB 카드로 만들기]** → 그 작가 KB 편집기가 열리며 새 카드에 질문이 프리필된다.
    작가가 방에서 답한 문장이 있으면 본문 초안으로 같이 넣는다.
  - **[방 열기]** → `/admin/chats/[id]` 로 맥락 확인
  - **[무시]** → 카드로 만들 필요 없는 질문 (일회성·잡담)
- 필터: 미처리 / 작가별 / 기간

### 탭 3. 지식 (`/admin/bot/kb`)
지금 만든 KB 편집기를 그대로 옮긴다. 추가할 것:
- **카드 사용 통계**: 이 카드가 최근 n번 인용됨 (`cited_card_ids` 기반).
  한 번도 안 쓰인 카드와, 매번 쓰이는 카드가 보이면 정리 기준이 생긴다.
- **답변 미리보기**: 질문을 넣어 지금 KB로 봇이 뭐라 답하는지 저장 전에 시험.
  (실제 `runBotQaTurn` 을 방 없이 호출 — 근거 검증까지 그대로 태운다)

### 탭 4. 정책·말투 (`/admin/bot/settings`)
지금 코드에 하드코딩된 것을 운영이 만지게 한다.

- **사매 공통 정책**(`platform-policy.ts`) — 문구 + 버전. 모든 작가 봇에 주입된다
- **기본 말투** — 작가가 따로 정하지 않았을 때
- **모델** — `claude-haiku-4-5` 기본, 필요 시 상향
- **전역 킬스위치** — 봇 응답 전면 중지 (사고 시 배포 없이 끄기). 끄면 모든 방이 "작가님께 전달드릴게요"로만 받는다

---

## 4. 필요한 DB (신규)

### `bot_turns` — 봇 한 턴의 기록 (관측의 전제)
지금은 `messages` 만 있어서 **어느 답이 근거 있는 답이었는지 역산할 수 없다.**
현황·통계·카드 사용량이 전부 이 테이블에 달려 있다.

```sql
create table public.bot_turns (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  question        text not null,
  reply           text not null default '',
  cited_card_ids  text[] not null default '{}',
  needs_human     boolean not null default false,
  had_kb          boolean not null default false,   -- KB 없는 작가의 이관 턴 구분
  latency_ms      integer,
  error           text,                             -- LLM 실패 시 사유
  created_at      timestamptz not null default now()
);
```
- 쓰기: `sendBotTurn` 이 매 턴 1행 (service_role)
- RLS: 운영자만 select
- ⚠️ 손님 발화가 그대로 들어간다 — `/admin/chats` 와 동일한 취급(운영 열람만), 보관 기간 정책 필요

### `bot_open_questions` 확장
```sql
alter table public.bot_open_questions
  add column dismissed_at timestamptz,        -- 카드로 만들 필요 없음 처리
  add column promoted_card_id text;           -- 어느 KB 카드로 승격됐는지
```

### `bot_settings` — 싱글턴
```sql
create table public.bot_settings (
  id              boolean primary key default true check (id),
  enabled         boolean not null default true,   -- 전역 킬스위치
  policy_text     text not null default '',
  policy_version  integer not null default 1,
  default_tone    text not null default '',
  model           text not null default 'claude-haiku-4-5-20251001',
  updated_at      timestamptz not null default now()
);
```
`platform-policy.ts` 는 폴백으로 남긴다 (DB 조회 실패해도 봇이 멈추지 않게 — `photographer-scripts-db` 와 같은 패턴).

---

## 5. 단계 (가치 / 비용 순)

| 단계 | 내용 | 왜 이 순서인가 |
|---|---|---|
| **0** | §1 버그 정리 — 작가 말투를 `buildQaPrompt` 에 배선, `/studio/bot` 문구 수정 | 잘못된 설정 화면을 남겨두면 작가가 헛일을 한다 |
| **1** | **빈틈 탭** + KB 승격 버튼 (`dismissed_at`·`promoted_card_id` 만 추가) | 데이터가 이미 쌓여 있다. 화면만 붙이면 되고 루프가 즉시 돈다 |
| **2** | `bot_turns` 로깅 + 현황 탭 | 관측이 생겨야 "KB를 채웠더니 나아졌다"를 말할 수 있다 |
| **3** | 답변 미리보기 · 카드 사용 통계 | 2단계 데이터 위에서만 의미가 있다 |
| **4** | `bot_settings` (정책·말투·모델·킬스위치) | 급하지 않다. 다만 킬스위치는 사고 나기 전에 |

1단계만으로도 운영이 매일 열 화면이 생긴다. 2단계 전에는 "감"으로 판단해야 하지만,
빈틈 큐 자체가 이미 가장 실행 가능한 신호다.

---

## 6. 열어둔 질문

- **작가에게도 보여줄까?** "당신 봇이 이 질문을 못 답했어요 → 답을 주시면 다음부터 봇이 답해요."
  작가가 직접 답을 채우면 운영 부담이 확 준다. 대신 KB 편집 권한을 어디까지 줄지 결정이 필요하다
  (현 정책: 운영만 등록·수정).
- **미답변 질문 묶기**를 어떻게 할까? 문자열 유사도로 충분한지, 임베딩까지 갈지.
  이미 `photo_tone_vectors` 로 임베딩 파이프라인은 있다.
- **손님 발화 보관 기간** — `bot_turns` 는 개인정보가 섞일 수 있다. 90일 후 익명화? 문구만 남기고 방 연결 끊기?
- 봇 답변에 손님이 "도움 안 됐어요"를 남길 수 있게 할까? 가장 정확한 품질 신호지만 대화 흐름을 끊는다.
