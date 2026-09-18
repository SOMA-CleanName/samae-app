# 37. 스키마 간극 점검 — 운영 DB 에 있고 repo 에 없는 것 (2026-09-17)

> 한 줄: **알림 푸시 경로 전체를 포함해, 테이블 9개·트리거 8개·함수 13개·인덱스 38개가
> 마이그레이션 기록 없이 운영 DB 에 들어와 있다.** 대부분 정상 동작 중이고, 그래서 더 위험하다.

> **정정 (2026-09-18) — 이 점검은 dev2 에서 했는데, 그때 dev2 에는 main 의 마이그레이션 0120~0129 가 없었다.**
> main 을 합친 뒤 다시 재니 **60개 → 27개**로 줄었다. 아래 목록 중 다음은 main 마이그레이션에 정의가 있다.
>
> | 이 문서에서 "repo 에 없다" 고 한 것 | 실제 정의 |
> |---|---|
> | FK 인덱스 19개 (§3-6) | main `0122_fk_indexes_for_account_deletion` |
> | `suspend_/restore_photographer_content`, `*_hidden_by_suspension_idx` | main `0126_suspend_hides_content` |
> | `similar_photos_by_vector(vector, int, int)` (§1) | main `0127_similar_photos_respect_feed_hidden` — **팀원이 의도해서 만든 함수.** 0121 이 운영 DB 에서 지웠고, 복구는 팀 결정 대기(docs/22 §6.4) |
> | `guide_items` · `spots` · `photographer_agreements` · `booking_extras` · `casting_applications` 등 | main 마이그레이션 |
>
> 다만 **main 의 0120~0129 는 운영 DB 에 적용돼 있는데 `_migrations` 에 하나도 기록이 없다.** "기록 없이 적용" 이라는
> 문제는 그대로다. **여전히 어디에도 정의가 없는 것**(27개)은 알림 푸시 트리거(§3-1)·문의→대화 트리거(§3-2)·
> `casting_rounds`·`casting_waitlist`·`device_tokens`·옛 문의 RPC(`app_*`) 등이고, 이 문서의 핵심 경고(§3-1·§3-2)는 유효하다.
> §3-8 의 "한 작업 세션에서 기록 없이 적용된 덩어리" 는 main 의 0122·0126·0127 을 SQL 편집기로 적용한 흔적으로 보인다.

---

## 1. 왜 이 문서를 쓰는가

2026-09-17, SigLIP 텍스트 검색이 이 오류로 죽었다.

```
Could not choose the best candidate function between:
  public.similar_photos_by_vector(p_embedding => extensions.halfvec, p_limit => integer),
  public.similar_photos_by_vector(p_embedding => extensions.vector, p_limit => integer, p_pool => integer)
```

`similar_photos_by_vector` 가 운영 DB 에 **두 개** 있었다. 하나(`halfvec`)는 `0079` 가 만든 것이고,
다른 하나(`vector` + `p_pool`)는 **어느 마이그레이션에도 정의가 없었다.** 코드만 읽어서는 보이지
않고, 빈 DB 로 마이그레이션을 처음부터 돌리면 재현도 되지 않는다. 경위는
[docs/22 §6.4](22-visual-similarity.md).

그때 "이 함수만 그런가" 를 확인하려고 전수 점검을 돌렸다. **이 함수만의 일이 아니었다.**

---

## 2. 어떻게 쟀나

```
node scripts/audit-schema-drift.cjs    # 이름이 repo 마이그레이션에 없는 객체
node scripts/check-rpc-overloads.cjs   # 이름이 겹치는 함수 (0121 이 그 사고)
```

`pg_catalog` 에서 public 스키마의 객체 이름을 꺼내 `supabase/migrations/*.sql` 전문에 그 이름이
**문자열로 등장하는지** 본다. 둘 다 읽기만 한다.

**한계를 먼저 밝힌다.**

- **이름만 본다.** 이름이 같고 본문이 다른 것은 못 잡는다 — 문제의 `similar_photos_by_vector`
  조차 이름으로는 안 걸렸다. 그건 `check-rpc-overloads.cjs` 가 따로 잡는다
- 제약조건이 자동으로 만드는 인덱스(`*_pkey`·`*_key`)는 SQL 에 이름이 안 적히므로 제외했다.
  안 빼면 121개가 거짓으로 걸린다
- **RLS 정책은 안 본다.** 노출 사고는 거기서 난다
- 이름이 다른 맥락에서 우연히 등장하면 놓친다

**아래 목록은 하한선이다.** 실제 간극은 이보다 크다.

---

## 3. 나온 것

### 3-1. 살아 있는 알림 푸시 경로 — 이게 제일 중요하다

`notifications` 에 행이 하나 들어갈 때마다 **DB 가 바깥으로 HTTP 를 쏜다.**

```
앱이 notifications INSERT
  → trg_on_notification_insert (트리거, repo 에 없음)
    → private.app_config 에서 edge_url·edge_key 를 읽고      (스키마·테이블 repo 에 없음)
      → net.http_post(edge_url, …)                          (pg_net 확장, repo 에 없음)
        → Supabase Edge Function                            (이 저장소에 코드 없음)
```

`private.app_config` 에는 `edge_url`·`edge_key` 두 키가 **둘 다 채워져 있다.** 미설정이면 조용히
건너뛰도록 짜여 있어(`return null`), 값이 비면 **알림 행은 남고 푸시만 조용히 안 간다.**
행 0개인 `device_tokens` 테이블도 이 경로의 일부로 보인다.

이 저장소에는 이 경로에 대한 기록이 **한 줄도 없다.** 카카오 알림톡([docs/34](34-kakao-alimtalk.md))과
`notify-templates.ts` 는 별개 경로다.

### 3-2. `inquiries` 상태가 바뀌면 대화가 생긴다 — 트리거가 한다

| 트리거 | 언제 | 무엇을 하는가 |
|---|---|---|
| `trg_on_inquiry_accepted` | `inquiries.status → accepted` | `notifications` 행 생성 (→ 3-1 로 이어짐) |
| `trg_on_inquiry_confirmed` | `inquiries.status → confirmed` | **`conversations` 생성**, `inquiries.conversation_id` 갱신, 브리프를 첫 `system` 메시지로 `messages` 에 삽입 |

둘 다 **켜져 있고 이 repo 가 쓰는 테이블에 걸려 있다.** 채팅방이 열리는 동작의 일부가 앱 코드가
아니라 DB 안에 있다는 뜻이다. [docs/23](23-inquiry-chat-system.md) 을 읽고 `bot-actions.ts` 만
따라가면 이 단계가 보이지 않는다.

### 3-3. 기록 없는 트리거 8개

```
trg_on_notification_insert            ← notifications     (3-1)
trg_on_inquiry_accepted               ← inquiries         (3-2)
trg_on_inquiry_confirmed              ← inquiries         (3-2)
trg_casting_applications_age_gate     ← casting_applications
trg_casting_applications_updated      ← casting_applications
trg_casting_rounds_updated            ← casting_rounds
trg_guide_items_updated               ← guide_items
trg_spots_updated                     ← spots
```

전체 45개 중 8개다. 앞의 셋이 문제고, 뒤의 다섯은 3-4 의 낯선 테이블에 붙은 것이다.

### 3-4. 테이블 9개 — repo 에 정의도 없고 이 repo 코드가 읽지도 않는다

| 테이블 | 행 | RLS |
|---|---:|---|
| `guide_items` | 33 | 켜짐 |
| `spots` | 22 | 켜짐 |
| `casting_round_photographers` | 3 | 켜짐 |
| `casting_rounds` | 1 | 켜짐 |
| `photographer_agreements` | 1 | 켜짐 |
| `casting_applications` | 0 | 켜짐 |
| `casting_waitlist` | 0 | 켜짐 |
| `booking_extras` | 0 | 켜짐 |
| `device_tokens` | 0 | 켜짐 |

**전부 RLS 가 켜져 있다.** 흘린 것이 아니라 제대로 만든 것이다. `guide_items`·`spots` 에는
실제 데이터가 있다. 캐스팅 4종은 한 기능 세트로 보이고 `casting_application_age_gate()`·
`age_years()` 가 딸려 있다.

> `spots` 는 헷갈리기 쉽다. `src/lib/spots.ts` 가 있지만 그것은 `photos` 를 조회하고, 명소 목록은
> `src/lib/spots-data.ts` 의 정적 상수 `PUBLISHED_SPOTS` 에서 온다.
> **DB 의 `spots` 테이블은 이 repo 가 읽지 않는다.**

### 3-5. 함수 13개 중 10개는 아무도 안 부른다

3-1·3-2 의 트리거 함수 셋을 빼면 나머지 10개는 이 repo 코드에서도, 트리거로도 호출되지 않는다.

| 묶음 | 함수 |
|---|---|
| 옛 문의(리드) 모델 | `app_submit_inquiry`, `app_accept_inquiry`, `app_my_inquiries`, `app_photographer_inquiries`, `app_report_deposit` |
| 작가 정지·복구 | `suspend_photographer_content(uuid)`, `restore_photographer_content(uuid)` |
| 캐스팅 | `casting_application_age_gate()`, `age_years(date, date)` |
| 기타 | `app_popular_posts(int, int)` |

`app_*` 다섯은 폐지된 리드 모델의 잔재로 **보인다** — CLAUDE.md 가 "리드 모델 폐지 → 채팅 상주"
라고 적고 있다. 다만 **이름이 `app_` 으로 시작하는 것은 PostgREST 로 바깥에서 부르라고 만든
꼴이다.** 이 repo 가 안 부른다고 아무도 안 부르는 것은 아니다. 지우기 전에 다른 클라이언트를
확인해야 한다.

작가 정지·복구는 `photos_hidden_by_suspension_idx`·`packages_hidden_by_suspension_idx` 와
한 세트다. 어드민 화면이 아직 연결되지 않은 기능으로 보인다.

### 3-6. 인덱스 38개 — 19개는 repo 가 아는 테이블에 붙어 있다

낯선 테이블에 붙은 19개는 자연스럽다. 놀라운 것은 나머지다.

```
album_ad_consent_logs_actor_idx        analytics_events_profile_id_idx
bookings_refund_paid_by_idx            idx_bookings_refund_unpaid
conversations_photographer_id_idx      deleted_records_deleted_by_idx
idx_inquiries_conversation             idx_inquiries_photographer_live
inquiries_deposit_confirmed_by_idx     messages_sender_id_idx
moderation_events_sender_id_idx        notification_queue_profile_id_idx
packages_hidden_by_suspension_idx      photographer_applications_profile_id_idx
photographers_business_license_verified_by_idx
photos_hidden_by_suspension_idx        reviews_user_id_idx
support_requests_photographer_ack_by_idx  support_requests_requester_id_idx
```

이름이 `<테이블>_<외래키컬럼>_idx` 꼴로 규칙적이다. **Supabase Performance Advisor 가 권하는
"인덱스 없는 외래키" 처방을 한 번에 적용한 것으로 보인다.** 성능에는 도움이 되지만 빈 DB 에는
없으므로, **로컬·CI 와 운영의 쿼리 계획이 다르다.**

### 3-7. 확장과 예약 작업 — 이건 문제가 아니다

설치된 확장: `btree_gist · pg_cron · pg_net · pg_stat_statements · pg_trgm · pgcrypto · plpgsql ·
supabase_vault · uuid-ossp · vector`. 마이그레이션에 `pg_cron`·`pg_net` 을 설치하는 문장은 없다.

`pg_cron` 작업이 하나 돌고 있다.

```
[1] 0 * * * *  chat-reminder  → net.http_get('https://www.samae.ai/api/cron/chat-reminder')
    최근 5회 전부 succeeded (2026-09-17 04:00~08:00 UTC)
```

`vercel.json` 에도 같은 경로가 `0 1 * * *` 로 있어 **겹쳐 보이지만 의도된 것이다.**
`src/app/api/cron/chat-reminder/route.ts` 주석이 설명한다 — Vercel Hobby 는 크론이 하루 1회가
상한이라 매시간으로 걸면 배포가 거부되고, pg_net 으로 직접 때리면 빈도 제한이 없어 리마인더가
12~13시간으로 좁혀진다. 라우트는 멱등이라(같은 대화에 12시간 안에 두 번 안 나감) 두 번 불려도
안전하다. **남은 정리거리는 `vercel.json` 의 `chat-reminder` 항목이 이제 불필요하다는 것뿐이다**
— 주석도 "그쪽을 붙이면 vercel.json 항목은 빼도 된다" 고 적고 있다.

### 3-8. 언제 들어왔나

Postgres 는 생성 시각을 저장하지 않지만 **oid 는 증가하므로 순서를 말해준다.**

```
30475~30490  analytics_events_profile_id_idx … casting_applications_decided_by_idx   ← FK 인덱스 배치
30566        photographers_business_license_verified_by_idx
30568        photographer_applications_profile_id_idx
30569        similar_photos_by_vector(vector, int, int)          ← 검색을 죽인 그 함수
30572        photos_hidden_by_suspension_idx
30573        packages_hidden_by_suspension_idx
30574        suspend_photographer_content(uuid)
```

**FK 인덱스 배치 · 문제의 함수 · 작가 정지 기능이 한 덩어리다.** 한 작업 세션에서 함께 적용됐다.
`_migrations` 에는 이 중 **아무것도** 기록돼 있지 않다.

---

## 4. 무엇을 뜻하나

**이 repo 의 마이그레이션은 운영 DB 의 부분집합이다.** 전 브랜치를 훑어봤지만 캐스팅·`spots`·
`guide_items` 를 만드는 마이그레이션은 **어디에도 없다.**

위험은 셋이다.

1. **동작의 일부가 코드 밖에 있다.** 알림 푸시(3-1)와 채팅방 생성(3-2)은 앱 코드를 아무리 읽어도
   안 보인다. 장애가 나면 **엉뚱한 데를 뒤지게 된다**
2. **재현 불가.** 빈 DB 로 마이그레이션을 돌려도 운영과 같은 상태가 되지 않는다. 로컬에서 통과한
   것이 운영에서 깨질 수 있고 그 반대도 된다. 인덱스가 달라 쿼리 계획도 다르다
3. **조용한 충돌.** `create or replace function` 은 인자 타입이 다르면 대체가 아니라 **추가**다.
   모르는 함수가 있으면 이름이 겹쳐도 알 수 없다 — `0121` 이 그것이다

---

## 5. 해야 할 일

**지금 당장 깨지는 것은 없다.** 서두를 일은 아니지만, 아래 영역을 건드리기 전에는 순서대로 해야 한다.
지우는 것은 맨 뒤다.

| | 무엇 | 왜 |
|---|---|---|
| 1 | **3-1·3-2 를 마이그레이션으로 역기록** | 가장 급하다. 살아 있고, 안 보이고, 장애 시 추적이 안 된다. `create or replace` 로 쓰면 운영은 무변경이고 빈 DB 만 따라온다 |
| 2 | **Edge Function 코드의 소재 확인** | `edge_url` 이 가리키는 함수가 어느 저장소에 있는지. 없으면 푸시가 통째로 미지의 코드다 |
| 3 | **[docs/23](23-inquiry-chat-system.md) 에 트리거 단계 추가** | 문의→대화 흐름 설명에 3-2 가 빠져 있다 |
| 4 | **주인 찾기** — 캐스팅·`spots`·`guide_items` 를 누가 만들었는지 팀에 확인 | 다른 저장소가 쓰고 있으면 **절대 건드리면 안 된다** |
| 5 | **FK 인덱스 19개 역기록** (`create index if not exists`) | 성능에 도움되므로 지우는 게 아니라 받아쓴다. 로컬·CI 를 운영에 맞춘다 |
| 6 | **RLS 정책 간극 재기** | 이 점검은 정책을 안 본다 |
| 7 | `vercel.json` 의 `chat-reminder` 항목 제거 | pg_cron 이 대신하고 있다 (3-7) |
| 8 | 확실히 죽은 것만 제거 | 4 가 끝난 뒤에. `0121` 처럼 왜 지우는지를 마이그레이션에 남길 것 |

---

## 6. 앞으로

**함수 시그니처를 바꿀 때는 `create or replace` 가 아니라 `drop function if exists` 로 옛 시그니처를
먼저 지운다.** `0080` 이 그렇게 한다. 이유는 [docs/22 §6.4](22-visual-similarity.md).

**대시보드에서 직접 고쳤다면 같은 SQL 을 마이그레이션 파일로도 남긴다.** `if not exists` /
`create or replace` 로 쓰면 운영에는 아무 일도 일어나지 않고 빈 DB 만 따라온다. 이 문서의 목록은
그 습관이 없어서 쌓인 것이다.

점검 두 개는 읽기 전용이다. 배포 전이나 DB 를 손대기 전에 한 번 돌리는 것으로 충분하다.
