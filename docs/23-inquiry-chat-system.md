# 문의·채팅 시스템 (챗봇 상주 + 에스크로) — 인수인계 문서

> 작성: 2026-08-26 · 브랜치 `feat/inquiry-chatbot` (60+ 커밋, main 미머지)
> 대상: 채팅 기능을 이어받는 개발자 + 그 개발자의 Claude Code 세션.
> **이 문서 하나로 현재 상태·플로우·파일 맵·테스트 방법을 전부 파악할 수 있게 쓴다.**

> ⚠️ **후속 개편이 있다: `docs/29-photo-detail-consult-booking.md`**
> (사진 상세 CTA 2트랙 · 작가 부재중 챗봇 · 봇 인계 영구화 · 촬영비/출장비 분리 · 안내 이미지)
> 이 문서는 그 개편의 전제가 되는 현행 봇·에스크로 구조를 설명한다.

---

## 0. 한 줄 요약

리드(연락처 중개) 모델을 폐지하고 **"채팅 상주" 모델**로 전환했다.
문의하기 → 채팅방 생성 → **같은 방 안에서 자동응답 봇이 문의를 수집** → 작가가 언제든 개입
→ 자동 접수(요약 카드) → 예약 제안 → **사매 계좌 에스크로 입금** → 운영자 확인 →
수수료 차감 정산 → **작가 수령 확인**까지, 전 과정이 채팅방 하나에서 끝난다.

---

## 1. 전체 플로우 (고객 여정)

```
사진/작가 프로필의 [문의하기]
  → /inquiry/bot?photographerId=..&photoId=..
     · 비로그인: 카카오 로그인 CTA 프리뷰 화면 (이 페이지의 유일한 남은 역할)
     · 로그인+전화번호 있음: 방 생성(ensureBotConversation) + 봇 인사·첫 질문·문의사진 시드
       → 즉시 /chat/[conversationId] 로 리다이렉트
     · 로그인+번호 없음: /signup/contact (전화번호 OTP) 경유 후 복귀
  → /chat/[id] 안에서 봇이 응답 (선택지 칩 + 타이핑 인디케이터)
     · 질문 수 고정: 코어 4개(촬영종류·희망일·지역·인원) + 작가 등록 커스텀 질문(0~3)
     · 4/4 (+커스텀) 완주 → 자동 접수: 요약 카드(summary_card) 게시, 버튼 없음
  → 작가는 스튜디오(/studio/chat)에서 같은 방 열람
     · 방 상단 "문의 체크리스트 n/4" — 수집 현황 실시간(Realtime)
     · 작가가 발화하면 = 개입: 봇 발화 정지, 이후 고객 발화는 일반 채팅(작가 알림 O)
       + 봇은 백그라운드에서 슬롯만 조용히 추출(extractOnly) — 4/4 되면 즉시 접수
     · 개입 순간 이미 4/4면 그 자리에서 즉시 접수 (sendMessage 훅)
  → 요약 카드(작가 화면)의 [이 내용으로 예약 제안] → 프리필된 예약 작성기 → 제안
  → 고객 [수락] = 체결 → 사매(플랫폼) 계좌 안내 (작가 계좌는 어디에도 비노출)
  → 고객 입금 + [입금 완료] → 어드민 /admin/transactions [입금 확인] → paid + 수수료 발생
  → 어드민 [정산 완료] (사매→작가 실송금 후 마킹, 송금액 = 촬영비 − 수수료 6,000)
  → 작가 카드에 [정산 받았어요] / [아직 못 받았어요 — 확인 요청] → 루프 종결
```

- **작가 답장 SMS 재소환**: 작가가 답하면(안읽음 1건째 + 4시간 쿨다운) 고객 번호로
  방 딥링크 포함 SMS (`src/lib/notify-user.ts`, 솔라피).
- **작가에게 고객 연락처는 어떤 단계에서도 비공개** (`src/lib/inquiries.ts`에서 전면 null).

---

## 2. 운영(디스코드) 알림 트리거 맵

문의 접수 시점에는 **울리지 않는다**. 운영이 움직여야 하는 시점만:

| 트리거 | 함수 | 채널 env |
|---|---|---|
| 예약 체결(수락) | `notifyOpsBookingAccepted` | `DISCORD_INQUIRY_WEBHOOK_URL` |
| 고객 [입금 완료] 신고 | `notifyOpsBookingDeposit` | `DISCORD_DEPOSIT_WEBHOOK_URL` |
| 작가 정산 미수령 확인 요청 | `notifyOpsSettlementDispute` | `DISCORD_DEPOSIT_WEBHOOK_URL` |

(전부 `src/lib/ops-alert.ts`. 미설정이면 `DISCORD_OPS_WEBHOOK_URL` 폴백, 그것도 없으면 조용히 패스.)
작가행 알림(새 문의·입금 확인·정산 완료)은 인앱 notifications + 채팅 시스템 메시지.
카카오 알림톡은 사업자 등록 후 — 끼울 지점은 `markSettlementPaid`(lib/payments.ts).

---

## 3. 파일 맵 (이번 개편에서 만들거나 크게 바뀐 것)

### 봇 코어 (서버)
| 파일 | 역할 |
|---|---|
| `src/lib/inquiry-bot-room.ts` | **채팅방 상주 봇 심장.** `runBotLlmTurn`(LLM 한 턴, haiku+구조화출력), `mapDbMessagesToBotHistory`(DB 메시지→대화 이력, 개입 감지), `seedBotRoomMessages`(방 시드) |
| `src/app/(user)/chat/bot-actions.ts` | `sendBotTurn` — 고객 발화 한 턴: 검열→저장→LLM(개입 시 추출만)→봇 응답 저장→bot_slots 갱신→완주 시 접수 |
| `src/lib/inquiry-bot-llm.ts` | 순수 공유 로직: `sanitizeBotTurn`, `enforceQuestionBudget`(질문 수 결정론), `canonicalChipsFor`(정식 선택지 칩), 프롬프트 빌더, 상한 검증 |
| `src/app/(user)/inquiry/actions.ts` | `finalizeBotInquiryFor`(고객 컨텍스트 없이 접수: inquiries 생성+요약 카드 승격), `ensureBotConversation`, `syncBotSlots`, `appendBotTurns`(레거시) |
| `src/app/api/inquiry-bot/route.ts` | 레거시/게이트 프리뷰용 API — 로직은 inquiry-bot-room 공유 |
| `src/lib/photographer-scripts-db.ts` | 작가 커스텀 대본 DB 조회 (`photographer_bot_scripts`), 파일 데모(`photographer-scripts.ts`) 폴백 |

### 채팅방 UI
| 파일 | 역할 |
|---|---|
| `src/app/(user)/chat/[conversationId]/ChatRoom.tsx` | 통합 방: 봇 모드(칩·타이핑·자동접수), 작가용 문의 체크리스트(실시간), 검열 차단 배너, 예약 카드(에스크로 송금·정산 수령 확인 버튼), 요약 카드([이 내용으로 예약 제안]) |
| `src/app/(user)/chat/[conversationId]/BookingComposer.tsx` | 예약 작성기 — 날짜(DateWheel)+자유 시간 선택(07:00~22:30 30분), 요약 기반 프리필(draft) |
| `src/app/(user)/chat/[conversationId]/page.tsx` | 방 서버 컴포넌트 — botMode/체크리스트/작성기 데이터 주입 |
| `src/app/(user)/chat/actions.ts` | `sendMessage`(검열+SMS 재소환+**개입 시 4/4 자동 접수 훅**), `getBookingPayoutAccount`(플랫폼 계좌 반환) |
| `src/app/(user)/inquiry/bot/InquiryBotChat.tsx` | ⚠️ 레거시 — 비로그인 게이트 프리뷰에서만 렌더. 본 플로우는 ChatRoom |

### 목록·역할 분리
| 파일 | 역할 |
|---|---|
| `src/app/(user)/my-inquiries/page.tsx` | 문의 탭 = 대화 허브 (내가 **고객**인 방만). 모든 방은 `/chat/[id]`로 |
| `src/app/(photographer)/studio/chat/page.tsx` | 스튜디오 문의함 (내가 **작가**로 받은 방만) |
| `src/components/user/RealtimeListRefresh.tsx` | 목록 실시간 리렌더 (messages INSERT / conversations UPDATE → 800ms 디바운스 refresh) |
| `src/app/(photographer)/studio/bot/` | 작가 커스텀 챗봇 설정 (말투 + 추가 질문 최대 3개) |

### 검열·알림·결제
| 파일 | 역할 |
|---|---|
| `src/lib/moderation.ts` | 오프플랫폼 감지: 전화(한글숫자 위장 포함)·SNS·이메일·URL·**계좌번호**(은행명/계좌단어+10자리+). 차단 시 `moderation_events` 기록 → 어드민 표시 |
| `src/lib/notify-user.ts` | 작가 답장 → 고객 SMS 재소환 (쿨다운·안읽음 조건) |
| `src/lib/sms.ts`, `src/lib/phone-otp.ts` | 솔라피 SMS·가입 전화번호 OTP |
| `src/lib/payments.ts` | 에스크로: `confirmBankTransferAdmin`(운영 입금확인→paid+수수료), `markSettlementPaid`(정산 마킹+채팅 안내), `PLATFORM_FEE_KRW=6000` |
| `src/app/actions/payments.ts` | `markTransferSent`(+디스코드), `ackSettlement`/`disputeSettlement`(작가 수령 확인/이의) |
| `src/lib/ops-alert.ts` | 디스코드 운영 알림 (§2) |

### 어드민
- `/admin/chats` — 전체 대화 모니터링 + 방별 트랜스크립트 + ⚠️ 검열 차단 기록
- `/admin/transactions` — 💰입금 확인 대기 / 📤정산 대기 / ⚠️정산 미수령 확인 요청 큐
- `/admin/calculator` — 건당 손익 계산기 (수수료×성사율×CPA)
- 플랫폼(사매) 계좌 설정: 어드민 문의 페이지의 기존 계좌 설정 재사용 (`lib/platform-account.ts`)

---

## 4. DB 변경 (마이그레이션 — **원격 Supabase에 전부 적용 완료**)

| 파일 | 내용 |
|---|---|
| 0084 | `phone_verifications` — 가입 전화번호 OTP |
| 0085 | `notification_queue` — 지연 알림용 (실행기 미구현) |
| 0086·0087 | `messages.type`에 `bot`(무알림 수집대화)·`summary_card`(작가 안읽음+1) + 트리거 |
| 0088 | `conversations.bot_photo_id` — 문의 출발 사진 |
| 0089 | `moderation_events` — 검열 차단 기록 |
| 0090 | `bookings.settled_at`, `settlement_amount_krw` — 정산 기록 |
| 0091 | `bookings.shoot_date` — 시간 미정이어도 날짜 확정 제안 |
| 0092 | `photographer_bot_scripts` — 작가 커스텀 대본 (RLS: 작가 본인) |
| 0093 | `conversations.bot_slots` — 봇 수집 슬롯 (작가 체크리스트·봇 상태의 진실) |
| 0094 | `bookings.settlement_ack_at`, `settlement_dispute_at` — 작가 수령 확인/이의 |

적용 방법: `node scripts/apply-migration.cjs supabase/migrations/00XX_*.sql`
(직결 DB URL이 IPv6 전용이라 실패하면 `.env.local`에 `SUPABASE_DB_POOLER_URL`
— `postgresql://postgres.<ref>:<pw>@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres` — 를 넣을 것.)

### 메시지 타입 의미
- `text`/`image`: 실사용자 발화 (작가 발화 = 개입 신호, 안읽음·알림 트리거)
- `bot`: 봇 수집 대화 (고객 발화도 개입 전엔 bot 타입 — 작가 알림 없음)
- `summary_card`: 접수 요약 (body=JSON `{purpose,preferredDate,region,partySize,note,inquiryId}`)
- `system`: 진행 안내 칩 (예약 체결·정산 등)

---

## 5. 환경변수 (`.env.local` — 커밋 금지)

```
ANTHROPIC_API_KEY=            # 봇 LLM (haiku-4.5). ANTHROPIC_MODEL 로 오버라이드 가능
SOLAPI_API_KEY= / SOLAPI_API_SECRET=   # SMS (⚠️ 잔액 확인, 키는 팀장에게)
SMS_SENDER=01077155195        # 발신번호 (알뜰폰 유심 도착 시 교체 예정)
INQUIRY_BOT_LOGIN_GATE=on     # 문의 로그인 게이트 (dev 기본 off, on 강제)
NEXT_PUBLIC_INQUIRY_BOT_LIVE=1 # dev에서도 실제 접수 (미설정 시 레거시 봇페이지 드라이런)
DISCORD_OPS_WEBHOOK_URL= / DISCORD_INQUIRY_WEBHOOK_URL= / DISCORD_DEPOSIT_WEBHOOK_URL=
```

Vercel(프로덕션) 배포 전 위 값들 등록 필요 — 아직 안 되어 있음.

---

## 6. 테스트 방법 (역할극 2창)

### 계정
| 역할 | 계정 | 비고 |
|---|---|---|
| 고객 | `roleplay-customer@samae.test` / `samae-test-2026` | dev용 가짜 계정. 프로필 번호=01077155195 (SMS가 정훈 폰으로 옴) |
| 작가 | 각자 계정에 작가 롤 부여 or 김재즈(정훈 소유, id `99d988d6-d42f-403e-b062-215d502ebc58`) | 로그인은 이메일 접이식 or 카카오 |

⚠️ `베라치노`(lkh-5626@…)는 **실유저** — 건드리지 말 것.

### 시나리오 (전 기능 1회전)
1. [고객] `/inquiry/bot?photographerId=<작가id>` → 방으로 리다이렉트 → 봇과 칩으로 4개 답변 → 요약 카드 자동 게시 확인
2. [작가] `/studio/chat` → 방 진입 → 체크리스트 n/4 실시간 확인 → 중간에 직접 답장(개입) → 고객 화면에 "여기서부터 작가님이 직접 답해요" 구분선
3. [작가] 요약 카드 [이 내용으로 예약 제안] → 프리필 확인 → 날짜+시간 선택 → 제안
4. [고객] [수락] → 사매 계좌 안내 → [입금 완료] → 디스코드 입금 채널 확인
5. [운영] `/admin/transactions` → [입금 확인] → [정산 완료]
6. [작가] 카드의 [정산 받았어요]/[아직 못 받았어요] → 후자는 디스코드+어드민 ⚠️큐
7. 검열: 아무 쪽에서 `공일공12345678`, `카톡 abc123`, `국민은행 123-456-789012` 전송 → 차단 + `/admin/chats` 기록
8. 커스텀 챗봇: [작가] 스튜디오→문의 챗봇에서 질문 등록 → 새 문의에서 그 질문이 나오는지

### 단위 테스트
```
npx tsx --test src/lib/*.test.ts    # 90+ 케이스 (검열·봇 sanitize·질문 예산 등)
npx tsc --noEmit
```

---

## 7. 알려진 한계 · 남은 일 (우선순위 순)

1. **팀 리뷰·머지**: 이 브랜치는 문의 플로우 전면 교체라 팀 합의 후 main 머지
2. **Vercel env** 등록 + 프로덕션 카카오 redirect 확인
3. **지연 SMS**: "작가가 보냈는데 고객이 N분 안 읽으면" — `notification_queue`(0085)에 쌓는
   설계만 있음. Vercel 크론 한도(2개 사용 중) 때문에 Supabase pg_cron 후보
4. **레퍼런스 이미지 vision 반응**: 통합 방에서는 이미지 전송·작가 열람만 되고 봇 코멘트 없음
   (레거시 봇페이지에는 있었음 — `runBotLlmTurn`의 `imageDataUrls` 파라미터는 살아있으니 배선만 하면 됨)
5. **Mixpanel 질문 단위 퍼널**(Q1~Q4 Viewed/Answered): 통합 방에서 미배선 (Submit Inquiry는 발화됨)
6. **알림톡**: 사업자 등록 후 — 정산 완료·입금 확인 지점에 끼우기
7. **inquiries.status 동기화**: 예약 확정 시 문의 상태 갱신 미구현
8. 솔라피 키 재발급 권장(대화 노출 이력) + 잔액 충전
9. 발신번호: 알뜰폰 유심 도착 시 솔라피 발신번호 등록 → `SMS_SENDER` 교체

---

## 8. 브랜치·개발 환경

- 브랜치: `feat/inquiry-chatbot` (이 문서 포함 60+ 커밋)
- 정훈 로컬은 git worktree `samae-app-chatbot`(port 3002)에서 개발했음 — 팀원은 그냥
  이 브랜치 checkout 하면 됨 (`npm run dev`)
- 마이그레이션은 원격 DB에 이미 적용돼 있어 별도 작업 불필요
- Next.js 16 주의사항은 프로젝트 CLAUDE.md 참고
