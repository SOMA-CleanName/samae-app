# 사진 상세 · 상담/예약 2트랙 · 작가 부재중 챗봇 (2026-08-27)

> 브랜치 `feat/photo-detail-consult`. 이 문서는 이번 개편의 **계약서**다.
> 병렬 작업자는 자기 청크 밖 파일을 건드리지 않는다. 겹치면 리포트에 적고 넘긴다.
> 선행 문서: `docs/23-inquiry-chat-system.md` (봇·에스크로 현행), `docs/04-database-schema.md`.

---

## 0. 무엇이 바뀌나 (한 장)

```
사진 상세 /photos/[id]
  ├─ [작가 상담하기]  → 채팅방 직행 (/chat/[id])           ← 신규
  ├─ [촬영 예약하기]  → 숨고형 문의 폼 (/inquiry) → 제출 → 같은 채팅방에 요약 카드
  ├─ 이 사진을 찍은 패키지 정보 (촬영시간·보정본·가격·촬영 위치)  ← 접힘에서 펼침으로
  └─ 작가 안내 이미지 2장 세로 → 탭하면 스와이프 뷰어(인디케이터)   ← 신규

채팅방
  · 사용자 인식 = "작가 채팅방". 챗봇은 **작가 부재중 대응자**.
  · 봇과 작가는 프로필 이미지로 구분된다.
  · 봇은 작가 KB(안내 이미지 내용)를 근거로 답한다. 모르면 작가에게 넘기고 질문을 기록한다.
  · 작가가 첫 발화 = 봇 영구 정지 + "작가님이 들어왔어요" 명시적 안내.
  · 협의가 되면 **양쪽 다** [예약하기] 제안 → 상대가 승낙/거절 → 승낙 시 결제(사매 계좌 에스크로).
  · 최종 촬영비 + (있으면) 출장비를 **따로** 기입한다.
```

기존 유지(재구현 금지): 입금 완료 → 디스코드 → 운영 이체 → 작가 정산 수령 확인 루프는
`docs/23` 대로 이미 동작한다. 이번 작업은 그 앞단(진입·봇·제안)만 손본다.

---

## 1. DB (적용 대기 — 원격 미적용)

### `0096_guide_images_bot_kb.sql`
- `photographer_guide_images(id, photographer_id, image_url, thumb_url, width, height, caption, published, sort_order, created_at, updated_at)`
  RLS: 공개분 누구나 select / 작가 본인 all. 버킷 `samae-guide` (공개 읽기).
- `photographer_bot_kb(photographer_id pk, cards jsonb, greeting, enabled, note, updated_at)`
  RLS: select = 작가 본인+운영자 / write = **운영자만**. 봇 서버는 service_role.

### `0097_bot_handoff_open_questions.sql`
- `conversations.bot_disabled_at`, `conversations.bot_handoff_notified_at` (단방향)
- `bot_open_questions(id, conversation_id, photographer_id, question, answered_at, created_at)`

적용: `node scripts/apply-migration.cjs supabase/migrations/0096_*.sql` (0097 도 동일). **아직 실행하지 않았다.**

---

## 2. 공용 라이브러리 (이미 작성됨 — 그대로 import)

| 파일 | export |
|---|---|
| `src/lib/guide-images.ts` | `GuideImage`, `GUIDE_PREVIEW_COUNT`(=2), `fetchGuideImages(photographerId)`, `listMyGuideImages(photographerId)` |
| `src/lib/bot-kb-db.ts` | `normalizeKbCards(raw)`, `parseKbJson(text)`, `fetchPhotographerKb(photographerId, displayName)`, `MAX_CARD_BODY`, `MAX_CARDS` |

`KbCard = { id, topic, body, source?, confirmedAt? }` — `src/lib/bot-kb.ts` 원본 타입.
KB 편집 정책: **이번 단계는 운영진이 어드민에서 JSON 을 직접 넣는다.** 작가 편집 UI 없음.

---

## 3. 청크 분해 (파일 소유권 — 남의 파일 금지)

| 청크 | 소유 파일 |
|---|---|
| **A 사진 상세** | `src/app/(user)/photos/[id]/**`, `src/components/user/GuideImageGallery.tsx` |
| **B 작가 안내 이미지 관리** | `src/app/api/guide/**`, `src/app/(photographer)/studio/guide/**`, 스튜디오 내비 |
| **C 어드민 KB** | `src/app/(admin)/admin/bot-kb/**`, `src/app/(admin)/admin/AdminNav.tsx` |
| **D 채팅방·봇** | `src/app/(user)/chat/**`, `src/lib/inquiry-bot*.ts`, `src/lib/bot-kb.ts`, `src/lib/chat.ts` |
| **E 예약·정산** | `src/app/actions/bookings.ts`, `src/app/(user)/bookings/**`, `src/app/(photographer)/studio/bookings/**`, `BookingComposer.tsx` |
| **F 숨고형 문의 폼** | `src/app/(user)/inquiry/**`, `src/lib/inquiry-bot.ts` |

`ChatRoom.tsx` 는 **D 전용**이다. E/F 가 여기 변경이 필요하면 코드로 고치지 말고 리포트에 적는다.

---

## 4. 확정된 UX 규칙

- **CTA 2개**: `작가 상담하기`(보조 스타일) · `촬영 예약하기`(brand 주 CTA). 작가 본인이면 둘 다 숨김.
- **패키지 정보**는 CTA **아래**, 펼친 상태. 사진↔패키지 FK 가 없으므로 기존 `nearestPackage`(가격 근접) 매칭을 그대로 쓴다. 촬영 위치 = `photos.location_text || photos.region`.
- **안내 이미지**: 기본 2장 세로, 나머지는 접기. 탭 → 전체화면 뷰어, 좌우 스와이프, 하단 인디케이터.
- **봇/작가 구분**: 봇 메시지는 봇 전용 아바타 + `사매 안내봇` 이름. 작가 메시지는 작가 아바타.
  봇은 "작가님이 자리를 비운 동안 제가 안내해요" 라는 위치를 스스로 밝힌다.
- **인계**: 작가 첫 발화 시 시스템 메시지 `작가님이 대화에 들어왔어요. 지금부터는 작가님이 직접 답해요.`
  이후 봇은 **다시 발화하지 않는다**(`bot_disabled_at`).
- **모르는 질문**: 봇이 `needsHuman` → "작가님께 여쭤보고 답해드릴게요" + `bot_open_questions` 기록.
- **예약 제안**: 양방향. 촬영비와 출장비를 **각각** 입력 → 카드에 분리 표기 → 합계가 입금액.
- **연락처**: 문의 폼에서 연락처 단계 제거. 작가에게 고객 연락처는 어떤 단계에서도 비공개.

---

## 5. 하지 말 것

- 오프플랫폼 검열(`src/lib/moderation.ts`) 완화
- 작가에게 고객 연락처 노출
- 에스크로 우회 경로 신설 (작가가 직접 입금확인하는 레거시 버튼은 **제거** 대상)
- Next.js 15 이하 패턴 (RSC·캐시 API)

---

## 6. 구현 결과 (2026-08-27 · 전 청크 완료)

`npx tsc --noEmit` 클린 · `npx tsx --test src/lib/*.test.ts` 97/97 · `npm run build` 성공.

### 새로 생긴 것
| 경로 | 내용 |
|---|---|
| `/chat/start?photographerId=&photoId=` | **작가 상담하기** 진입. 로그인·번호 게이트 → `ensureBotConversation` → 봇 인사 시드 → `/chat/[id]` 리다이렉트 (화면 없음) |
| `/studio/guide` | 작가 안내 이미지 관리 (업로드·캡션·공개·순서·삭제). 업로드 API `/api/guide/upload`, 버킷 `samae-guide` |
| `/admin/bot-kb` | **운영진 KB JSON 등록**. 작가 선택 → 카드 JSON·인사말·enabled·운영메모. 검증 실패 시 저장 거부(부분 저장 없음), 파일 데모 불러오기 지원 |
| `src/lib/bot-identity.ts` | `BOT_DISPLAY_NAME`, `BOT_HANDOFF_NOTICE` — 서버/클라이언트 공용 (렌더 분기가 이 문자열을 본다) |
| `src/lib/bot-handoff.ts` | `handlePhotographerTakeover` / `recordOpenQuestion` / `closeOpenQuestions` / `listOpenQuestions` |
| `src/lib/bot-kb-db.ts` | `parseKbJson` · `normalizeKbCards` · `fetchPhotographerKb` · `photographerHasKb` |
| `src/lib/guide-images.ts` (+ `-shared.ts`) | 안내 이미지 조회 / 상수(클라이언트 공용) |
| `PackageInfoSection.tsx`, `GuideImageGallery.tsx` | 사진 상세의 패키지 정보 · 안내 이미지 세로 2장 + 스와이프 뷰어(인디케이터) |

### 인계(handoff) 최종 규칙
- `handlePhotographerTakeover` 를 **메시지 삽입 직전에** 호출한다 — `chat/actions.ts`(텍스트·포트폴리오 사진), `api/chat/upload`(사진). 뒤에 부르면 안내가 작가 첫 마디 아래로 밀린다.
- 안내는 `system` 이 아니라 **`bot` 타입**으로 넣는다. 요구사항상 알리는 주체가 봇이고, `on_message_insert` 가 `bot` 은 타임라인만 갱신해 **중복 알림이 안 생긴다.**
- 봇 정지의 진실은 `conversations.bot_disabled_at`. 이력 파생(`mapDbMessagesToBotHistory`)은 0097 이전 구방 폴백으로만 남겼다.
- 봇이 인계를 직접 말한 방에서는 기존 초록 구분선(`여기서부터 작가님이 직접 답해요`)을 그리지 않는다 — 신호 중복.

### 봇/작가 시각 구분
- 봇: 라운드 사각 + 안테나 아이콘 (`BotAvatar`), 이름 `사매 안내봇`, `자동 응답 · HH:MM`.
- 작가: 원형 프로필 사진(`Avatar size="xs"`). 실루엣부터 다르게 잡았다.
- 인계 안내 말풍선만 `success` 톤으로 구분.

### 봇이 사는 조건 (`chat/[conversationId]/page.tsx`)
```
botLives = qaMode || (startedWithBot && !inquirySubmitted)
botMode  = amCustomer && botLives && !photographerIntervened
```
숨고형 폼(/inquiry)으로 만들어진 방은 진입 시점에 이미 요약 카드가 있으므로,
**KB(qaMode)가 있어야** 봇이 계속 응대한다. 봇 발화가 하나도 없으면
`seedQaGreetingIfMissing` 이 인사 한 줄을 깐다(메시지 조회 전에 호출 — 그 렌더에 바로 보인다).

---

## 7. 남은 일 (우선순위 순)

1. **마이그레이션 원격 적용 — 이거 없이는 전부 실패한다.**
   `node scripts/apply-migration.cjs supabase/migrations/0096_guide_images_bot_kb.sql`
   `node scripts/apply-migration.cjs supabase/migrations/0097_bot_handoff_open_questions.sql`
   (직결 실패 시 `.env.local` 에 `SUPABASE_DB_POOLER_URL` — docs/23 §4 참조)
2. **작가별 KB 등록.** KB 가 없는 작가는 폼 트랙 방에서 봇이 침묵한다(답할 근거가 없으니 정직한 동작).
   `/admin/bot-kb` 에서 김재즈·Hyun 등 실사용 작가부터. `bot-kb-data.ts` 데모는 `파일 데모 불러오기` 로 이관.
3. **역할극 재검증** (docs/23 §6 시나리오) — 특히 ① 상담 트랙 `/chat/start` ② 폼 트랙 제출 후 방 ③ 작가 첫 발화 시 인계 안내 순서 ④ 촬영비/출장비 분리 제안 → 입금 → 정산.
4. **애널리틱스**: 문의 퍼널 v2 → **v3**. `Inquiry Q6 Contact*` 소멸 → `Inquiry Review*` 로 대체, `total_steps` 가 작가별 가변(질문수+1). 저장된 퍼널의 마지막 스텝 교체 필요.
5. **데드코드 정리** (별도 커밋 권장): `confirmTransfer`(app/actions/payments.ts) · `confirmBankTransfer`·`getPayoutAccountForBooking`(lib/payments.ts) 호출자 0 · `/bookings/[id]/pay` 리다이렉트 스텁 · `photographers.travel_fee_krw`(더는 예약 생성에서 안 읽음).
6. **안내 이미지 삭제 시 Storage 오브젝트 잔존** — DB 행만 지운다(about 섹션과 동일 정책). 고아 파일 청소 잡 미구현.
7. **`bot_open_questions` 는 방 안에서만 보인다** — 작가 대시보드(`/studio`)의 전역 큐는 아직 없음.
