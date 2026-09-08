# 카카오 알림톡 — 솔라피 셋업·문안·운영

> 작성: 2026-09-07 · 브랜치 `feat/kakao-alimtalk`
> 코드는 끝나 있다. 이 문서는 **콘솔에서 사람이 해야 하는 일**과 그 뒤 운영 규칙이다.

---

## 0. 한 줄 요약

서비스 밖으로 나가는 알림(작가 답장·새 문의·예약 제안·수락·입금 확인·정산)을
**카카오 알림톡 1순위, 문자 대체**로 보낸다. 공급사는 솔라피 하나(문자·OTP 와 같은 계정).
템플릿 ID 가 등록된 알림만 알림톡으로 나가고, 나머지는 자동으로 문자로 내려간다 —
심사가 끝나는 것부터 하나씩 env 에 채우면 된다.

## 1. 왜 솔라피인가 (결정 기록)

- 알림톡은 카카오가 직접 팔지 않는다. 어느 대행사든 끼어야 하고, 우리 규모에서 단가 차이는 없다.
- 이미 문자(OTP·재소환)를 솔라피 어댑터로 짜 두었다. 알림톡은 같은 엔드포인트에 `kakaoOptions` 만 얹는다.
- 카카오 단계 실패(알림톡 미가입·채널 차단)를 솔라피가 문자로 대체 발송해 준다. 우리는 "요청 자체가 거부된" 경우만 문자로 재시도한다.
- **묶이는 건 템플릿 심사다.** 회사를 옮기면 7종을 다시 등록·심사한다. 코드는 `alimtalk.ts` 한 파일 교체.
- 검토했다 버린 것: 카카오 "나에게 보내기"(본인 한정·토큰 갱신 부담·이메일 가입자 제외·용도 외 사용).

## 2. 콘솔 체크리스트 (순서대로)

전제: 사업자등록 완료 ✅ · 카카오 비즈니스 채널 개설 ✅ · 070 대표번호 개통 ✅

| # | 할 일 | 어디서 | 산출물 → env |
|---|---|---|---|
| 1 | 솔라피 가입(사업자) + **API 키 새로 발급** (구 키는 대화 노출 이력 — docs/23 §7) | solapi.com → API Key | `SOLAPI_API_KEY`, `SOLAPI_API_SECRET` |
| 2 | 발신번호 등록 — 070 번호, 통신서비스 이용증명원 첨부 | 콘솔 → 발신번호 관리 | `SMS_SENDER=07052364673` |
| 3 | 카카오 채널 연동 — 채널 검색용 아이디 + 카카오 채널 관리자 휴대폰 인증 | 콘솔 → 카카오 → 채널 연동 | `SOLAPI_KAKAO_PF_ID` |
| 4 | 템플릿 7종 등록 — §3 원문 그대로, 버튼은 웹링크(변수) | 콘솔 → 카카오 → 템플릿 | 승인 후 `ALIMTALK_TPL_*` |
| 5 | 선불 충전 + **잔액 알림** 설정 (떨어지면 조용히 멈춘다) | 콘솔 → 결제 | — |
| 6 | Vercel 프로덕션 env 등록 (위 전부) | Vercel → Settings → Env | — |
| 7 | 마이그레이션 `0109` 원격 적용 | `node scripts/migrate.cjs 0109` | — |

- 3번 채널 연동 조건: 채널이 **비즈니스 채널**이어야 하고, 프로필 설정에서 '채널 검색 허용'이 켜져 있어야 한다.
- 4번 심사는 건당 영업일 2~3일. 문안은 §3 그대로 내고, 고치면 코드 쪽 `notify-templates.ts` 도 같이 고쳐야 한다(테스트가 변수 불일치를 잡는다).
- 템플릿 카테고리: 전부 **"서비스 이용 → 이용안내/공지"** 또는 **"구매 → 주문/예약"**. 광고성 표기 없음.

### 실제로 겪은 반려 (2026-09-08 · `chat_reply`)

> 알림톡은 **수신자의 액션을 기반한** 정보성 메시지에 한하여 발송 가능하오나, 상기 메시지
> 내용만으로는 **수신 대상을 명확하게 확인하기 어려워** 반려 처리되었습니다. 해당 메시지는
> 어떠한 상황에서 발송되는 메시지인가요? 수신자의 어떠한 액션으로 발송되는지 **메시지 내**
> 추가하여 주시기 바랍니다. (예: 1:1 문의하신, 계약하신 등)

반려된 본문은 `[사매] #{작가명} 작가님의 답장이 도착했어요.` 였다. 내용은 명백히 정보성인데
**"이 사람이 왜 이걸 받는가"** 가 문안에 없어서 걸렸다.

**검수자 참고 의견란에 아무리 자세히 써도 소용없다.** 심사는 본문만 본다.
그래서 §3 문안 7종 전부 첫 줄에 수신자의 행동을 넣었다 —
`문의하신` · `등록하신` · `상담 중인` · `제안하신` · `입금하신` · `수락하신` · `예약하신`.

반려돼도 템플릿은 살아 있다(`재검수필요`). 목록에서 [템플릿 수정] → 본문 고치고 재검수 요청하면
된다. 검수가 **통과된** 뒤에는 수정이 막히고 사본을 새로 만들어야 하므로, 고칠 게 있으면
반려 상태일 때 고치는 편이 낫다.

## 3. 템플릿 원문 (콘솔에 붙여넣기)

문안의 진실은 `src/lib/notify-templates.ts` 다. 아래는 `npx tsx scripts/print-alimtalk-templates.ts` 출력.
변수는 `#{이름}` 그대로 등록한다. 버튼 타입은 **웹링크(WL)**, Mobile/PC 둘 다 아래 URL 을 넣는다.

> ⚠️ **첫 줄에 "수신자가 무엇을 했는지" 가 반드시 들어 있어야 한다** (문의하신 / 등록하신 /
> 제안하신 / 입금하신 / 수락하신 / 예약하신). 2026-09-08 `chat_reply` 가 이것 때문에 반려됐다 — §2 참고.
>
> ⚠️ **버튼 URL 에 `#{링크}` 를 그대로 넣을 수 없다.** 카카오는 웹링크에 프로토콜이 고정으로
> 앞에 있기를 요구해서 변수 하나만 넣으면 콘솔이 등록을 거부한다. 도메인까지 박고 경로만
> 변수로 뺀다(`https://samae.ai/chat/#{채팅방ID}`). 이 경로 변수는 본문에 없으므로
> `variables` 에 넣지 않고 `notify-user.ts` 가 발송할 때 따로 채워 보낸다.
> 본문의 `#{링크}` 는 그대로 둔다 — 문자로 대체 발송되면 버튼이 없다.

## 작가 답장  (chat_reply → ALIMTALK_TPL_CHAT_REPLY)
받는 사람: customer · 변수: #{작가명}, #{링크}
버튼: [답장 확인하기] 웹링크 → https://samae.ai/chat/#{채팅방ID}
```
[사매] 문의하신 내용에 #{작가명} 작가님이 답장을 보냈어요.
채팅방에서 확인해 주세요.
#{링크}
```

## 새 문의  (inquiry_received → ALIMTALK_TPL_INQUIRY_RECEIVED)
받는 사람: photographer · 변수: #{링크}
버튼: [문의 확인하기] 웹링크 → https://samae.ai/chat/#{채팅방ID}
```
[사매] 등록하신 스튜디오로 새 문의가 들어왔어요.
안내봇이 먼저 답하고 있어요. 여유 있을 때 채팅방에서 이어받아 주세요.
#{링크}
```

## 예약 제안  (booking_proposed → ALIMTALK_TPL_BOOKING_PROPOSED)
받는 사람: counterparty · 변수: #{상대명}, #{촬영일}, #{금액}, #{링크}
버튼: [제안 확인하기] 웹링크 → https://samae.ai/bookings/#{예약ID}
```
[사매] 상담 중인 촬영 건에 #{상대명}님이 예약을 제안했어요.
· 촬영일: #{촬영일}
· 금액: #{금액}원
채팅방에서 내용을 확인하고 수락해 주세요.
#{링크}
```

## 예약 수락  (booking_accepted → ALIMTALK_TPL_BOOKING_ACCEPTED)
받는 사람: counterparty · 변수: #{상대명}, #{촬영일}, #{링크}
버튼: [예약 확인하기] 웹링크 → https://samae.ai/bookings/#{예약ID}
```
[사매] 제안하신 예약을 #{상대명}님이 수락했어요.
· 촬영일: #{촬영일}
입금이 확인되면 예약이 확정돼요. 확인되는 대로 다시 알려드릴게요.
#{링크}
```

## 입금 확인 (고객)  (deposit_confirmed → ALIMTALK_TPL_DEPOSIT_CONFIRMED)
받는 사람: customer · 변수: #{작가명}, #{촬영일}, #{링크}
버튼: [예약 확인하기] 웹링크 → https://samae.ai/bookings/#{예약ID}
```
[사매] 입금하신 예약금이 확인되어 예약이 확정됐어요.
· 작가: #{작가명}
· 촬영일: #{촬영일}
작가님이 촬영을 준비해요. 자세한 내용은 예약 페이지에서 확인해 주세요.
#{링크}
```

## 입금 확인 (작가)  (booking_confirmed → ALIMTALK_TPL_BOOKING_CONFIRMED)
받는 사람: photographer · 변수: #{고객명}, #{촬영일}, #{정산금액}, #{링크}
버튼: [정산 내역 보기] 웹링크 → https://samae.ai/studio/settlements
```
[사매] 수락하신 예약의 입금이 확인되어 예약이 확정됐어요.
· 고객: #{고객명}
· 촬영일: #{촬영일}
· 정산 예정: #{정산금액}원 (수수료 차감 후)
#{링크}
```

## 정산 완료  (settlement_paid → ALIMTALK_TPL_SETTLEMENT_PAID)
받는 사람: photographer · 변수: #{촬영일}, #{정산금액}, #{링크}
버튼: [정산 내역 보기] 웹링크 → https://samae.ai/studio/settlements
```
[사매] 예약하신 촬영 건의 정산이 완료됐어요.
· 촬영일: #{촬영일}
· 송금액: #{정산금액}원 (수수료 차감 후)
받으신 내역을 스튜디오에서 확인해 주세요.
#{링크}
```

## 4. 코드 구조

```
호출부 (언제)                    notify-user.ts          notify-dispatch.ts (어떻게)         어댑터
─────────────────────────────    ───────────────────     ─────────────────────────────    ─────────────
chat/actions.ts 작가 발화     →  notifyUserOfPhotographerReply   ┐
chat/bot-actions.ts 첫 발화   →  notifyPhotographerOfNewInquiry  │  dispatchNotify(kind, vars)    alimtalk.ts ──┐
actions/bookings.ts 제안·수락 →  notifyBookingProposed/Accepted  ├→  · dedupe (영구 1회 / 쿨다운)   sms.ts ──────┼→ solapi.ts
lib/payments.ts 입금확인      →  notifyDepositConfirmed          │   · 채널 선택 (템플릿 ID 유무)                  │
                              →  notifyBookingConfirmedToPhoto.. │   · notification_queue 기록      (HMAC·fetch) ┘
lib/payments.ts 정산완료      →  notifySettlementPaid            ┘   · 알림톡 거부 → 문자 재시도
```

| 파일 | 역할 |
|---|---|
| `src/lib/notify-templates.ts` | kind 7종·문안·변수·버튼. 순수 함수 — `notify-templates.test.ts` 가 변수 불일치·잔여 `#{}` 를 잡는다 |
| `src/lib/notify-dispatch.ts` | 단일 통로. 큐에 pending 먼저 쓰고 결과로 갱신 — 중간에 죽어도 "보내려 했다" 는 남는다 |
| `src/lib/notify-user.ts` | 발송 시점 규칙. 채팅만 별도 판정, 나머지는 사건당 영구 1회 |
| `src/lib/notification-policy.ts` | 채팅 답장 알림 판정(보는 중 → 쿨다운). 순수 함수 — `notification-policy.test.ts` |
| `src/lib/alimtalk.ts` · `sms.ts` · `solapi.ts` | 공급자 어댑터. 갈아탈 때 여기만 |
| `supabase/migrations/0109` | `notification_queue.channel / template_code / variables / provider_group_id` |
| `supabase/migrations/0110` | `conversations.user_read_at` — 답장 알림 억제 판정용 |

### 채팅 답장 알림은 왜 다른가

거래 알림(제안·수락·입금·정산)은 사건당 1회고 늦으면 거래가 멈춘다. 규칙이 단순하다.
채팅 답장은 소음이 되기 쉬워서 억제 규칙이 따로 있다. **전부 즉시 발송이고 크론은 없다.**

```
작가 답장 도착
  ① 최근 2분 안에 읽은 방인가?      → 예. 안 보낸다 (지금 보고 있다)
  ② 직전 알림 뒤로 읽은 적 없고
     24h 안 지났나?                → 예. 안 보낸다
  ③ 그 외                          → 즉시 발송
```

**`user_unread` 로는 ①을 못 잡는다.** 작가가 보내면 트리거가 +1 하고 곧바로 알림 판정이
도는데, 고객 브라우저의 읽음 처리(realtime → `markRead`)는 그 뒤에 도착한다.
판정 시점에는 늘 "안 읽음" 으로 보인다. 그래서 안읽음 수가 아니라 **마지막으로 읽은 시각**
(`conversations.user_read_at`)을 본다 — 방을 열어두면 상대 메시지가 올 때마다
`markRead` 가 불려(`ChatRoom.tsx:242`) 이 값이 계속 갱신된다.

②에서 **읽었으면 쿨다운이 풀리는 것**이 핵심이다. 단순히 "24시간에 한 번" 으로 두면
고객이 알림 받고 읽고 나간 뒤 온 새 답장이 하루 동안 안 알려진다. 쿨다운의 본뜻은
"안 읽은 채로 또 보내지 않는다" 이므로, 읽은 시점이 마지막 발송보다 뒤면 리셋한다.

`VIEWING_WINDOW_MS`(2분)는 짧으면 대화 중에도 알림이 새고, 길면 앱을 닫은 뒤 온 답장을
놓친다. 조정은 `notification-policy.ts` 상수 하나.

**dedupe 키**: `<kind>:<conversationId|bookingId>`. `status='sent'` 이력만 본다 — `skipped`·`failed` 는 재시도를 막지 않는다.

**링크 도메인**: 운영에서는 `SITE_URL`(samae.ai) 고정. `NEXT_PUBLIC_SITE_URL` 은 로컬 localhost 라 보지 않는다.
(구 코드가 `samae.co.kr` 로 폴백하고 있었다 — 이번에 고침.)

## 5. dev 에서 확인하는 법

- 키 없음 → 어댑터 스텁: 서버 콘솔에 `[alimtalk:stub]` / `[sms:stub]` 로 본문이 찍히고 큐에는 `skipped/dev`.
- 실발송 테스트: `.env.local` 에 키 + `NOTIFY_SMS_DEV=on`. 본인 번호로 로그인한 계정에만 보낼 것.
- 큐 확인: `select kind, channel, status, error, phone, created_at from notification_queue order by created_at desc limit 20;`
- 알림톡이 나갔는데 카카오에서 문자로 대체됐는지는 솔라피 콘솔 → 발송 내역에서 `provider_group_id` 로 찾는다.

## 6. 운영 규칙

- **문안 변경 = 재심사.** 승인 전에는 카카오 본문(구)과 문자 대체 본문(신)이 어긋난다. 바꿀 땐 템플릿 재등록 → 승인 → env ID 교체까지 한 세트.
- 변수에 **연락처·계좌번호 금지**. 이름·촬영일·금액·링크까지만.
- 잔액 알림은 반드시. 선불이라 0 이 되면 알림톡·문자·OTP 가 한꺼번에 조용히 멈춘다.
- 실패는 거래를 막지 않는다 — 큐의 `failed` 를 어드민에서 주기적으로 본다 (§7).

## 7. 남은 일

1. §2 콘솔 작업 (사람 손) — 3·4 번이 일정의 대부분
2. 어드민 발송 이력 페이지(`/admin/notifications`) — 큐를 눈으로 보고 `failed` 재발송
3. `docs/23` §7 의 "지연 SMS(N분 안 읽으면)" 는 이 큐 위에 pg_cron 으로 — 아직 미착수
4. 웹 푸시(PWA) — 알림톡과 별개로 언제든. 무료지만 iOS 는 홈 화면 추가 전제
