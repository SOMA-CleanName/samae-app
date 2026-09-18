# 42. PG 전환 계획 — 심사 통과한 날 뭘 바꾸나 (2026-09-19 작성, 미시행)

> 🟡 **아직 켜지 않았다.** 지금 결제는 무통장(사매 계좌)이고, 이 문서는 KG 심사가 끝난 날
> **찾아다니지 않기 위해** 미리 적어 둔 것이다. 코드에는 스위치(`lib/payment-mode.ts`)만
> 박아 뒀고 PG 분기는 렌더되지 않는다 — 지금 화면은 이 문서 이전과 똑같다.

## 0. 왜 미리 적어 두나

무통장에서 PG 로 넘어가는 날의 위험은 기능이 아니라 **누락**이다.

고객이 카드로 결제를 마쳤는데 어느 지면에 "사매 계좌로 입금해 주세요" 가 남아 있으면
**두 번 낸다.** 반대로 PG 분기를 잘못 켜면 계좌 안내는 사라졌는데 결제창은 없어서
**돈 낼 방법이 아예 없어진다.** 둘 다 전환 당일에 터지고, 둘 다 코드를 뒤지며 고칠
시간이 없다.

그래서 ① 스위치를 한 곳에 두고 ② 건드릴 파일을 미리 세어 둔다.

## 1. 계약 조건 (KG이니시스)

| | |
|---|---|
| 결제 수수료 | **2.8%** |
| 지급대행 | 건당 **400원** |
| 지급 데이터 송신 | **수동** (상점관리자에서 사람이 올린다) |
| 보증보험 | 월 거래액 **2배수** 룰 |

⚠️ **수수료가 둘로 늘어난다.** 지금 작가에게서 떼는 건 중개 수수료 하나뿐인데
(작가약관 12조), PG 수수료 2.8% 와 지급대행 400원은 **사매가 부담한다**고 정산 지면에
이미 적혀 있다 (`SettlementsBody`: "결제대행 수수료는 사매가 부담해요"). 전환해도 그
문장이 참이어야 한다 — 작가 몫에서 빼면 약관 위반이다.

## 2. 스위치

```
PAYMENT_MODE=pg      # 없거나 모르는 값이면 bank_transfer (lib/payment-mode.ts)
```

모호하면 무통장으로 떨어지게 해 뒀다. 오타 하나로 결제 수단이 통째로 사라지는 쪽이
훨씬 비싸서다. 테스트로 박아 뒀다(`payment-mode.test.ts`).

읽는 함수는 셋뿐이다.

```ts
paymentMode()        // "bank_transfer" | "pg"
showsBankAccount()   // 고객에게 사매 계좌를 안내하는가
needsManualConfirm() // 운영이 계좌 내역과 손으로 대조하는가
```

## 3. 갈아탈 지점 — 코드에서 세어 본 것

### 3-1. 돈이 들어오는 자리 (핵심)

지금 `accepted → paid` 전이를 하는 함수는 **둘뿐이고 하는 일이 같다.**

| 함수 | 지금 누가 부르나 | PG 에서 |
|---|---|---|
| `confirmBankTransfer` (`payments.ts:224`) | 고객 [입금 완료] → 운영 확인 | 안 쓴다 |
| `confirmBankTransferAdmin` (`payments.ts:296`) | 어드민 「입금 확인 대기」 | 안 쓴다 |

**여기가 이음매다.** PG 웹훅 핸들러(신설)가 결제 승인을 받아 같은 전이를 하면 된다 —
상태·수수료 스냅샷·알림까지 이미 그 함수 안에 있으므로 **새로 쓰지 말고 재사용**할 것.
결제 승인 데이터(거래번호·승인시각·수단)를 담을 칸만 더 필요하다.

> ⚠️ `transfer_marked_at` 은 **청약철회 7일의 기산점**이다(docs/32 §3-2).
> PG 로 바뀌면 이 값은 "고객이 입금했다고 누른 시각" 이 아니라 **결제 승인 시각**이다.
> 비워 두면 환불 판정이 통째로 어긋난다. 반드시 채울 것.

### 3-2. 고객에게 계좌를 안내하는 지면

`getPlatformAccount` / `hasAccount` 를 쓰는 곳 — 전부 `showsBankAccount()` 로 감싸야 한다.

```
src/app/(user)/chat/actions.ts
src/app/(user)/chat/[conversationId]/page.tsx
src/app/(user)/bookings/[id]/page.tsx
src/app/(photographer)/studio/actions.ts
src/app/(admin)/admin/transactions/page.tsx   ← 이미 감싸 뒀다 (본보기)
```

어드민 쪽은 이미 되어 있다. 나머지 넷은 전환일에 같은 모양으로 감싸면 된다.

### 3-3. [입금 완료] 버튼

고객이 "넣었어요" 를 누르는 자리. PG 에서는 **결제창이 그 자리를 대신한다.**

```
src/app/(user)/chat/[conversationId]/AcceptPayDialog.tsx   ← 주 진입
src/app/(user)/chat/[conversationId]/ChatRoom.tsx
src/app/(user)/chat/[conversationId]/BookingComposer.tsx
src/app/(user)/chat/[conversationId]/ExtraCard.tsx         ← 추가 결제
src/app/(user)/bookings/[id]/page.tsx                      ← DepositGate
src/app/(photographer)/studio/bookings/page.tsx            ← 작가 시점 표시
```

> ⚠️ `DepositGate` 에는 **임박 예약 동의**(촬영 7일 이내면 위약금 구간 동의)가 붙어 있다.
> 결제창으로 바꾸면서 이 게이트를 건너뛰면 **환불 분쟁에서 근거가 사라진다.**
> 결제 전에 받아야 한다 — 순서를 바꾸지 말 것.

### 3-4. 어드민 큐

`「입금 확인 대기」`(`lib/admin-queues.ts` `awaitingConfirm`)는 **PG 에서 항상 비어야
정상**이다. 웹훅이 즉시 확인하므로 사람이 볼 일이 없다.

- 큐 자체는 지우지 말 것 — 웹훅이 실패해 수동 확인이 필요한 건이 여기 남는다.
  **오히려 이때부터가 이 큐의 진짜 쓸모다**(장애 감지).
- 대시보드 문구 "고객이 입금을 알렸어요" → "웹훅이 놓친 건" 으로.

`「정산 대기」`는 **그대로 쓴다.** 지급 데이터 송신이 수동이라(§1) 사람이 누르는 건
안 바뀐다. 지급대행 400원이 빠지는 건 사매 부담이라 작가 정산액에는 영향이 없다.

### 3-5. 환불

지금은 운영이 계좌로 직접 송금하고 `adminMarkRefundPaid` 로 기록한다. PG 에서는
**승인 취소(전체/부분)** 가 된다 — 카드 취소는 원결제로 되돌아가므로 고객 환불 계좌를
받을 이유가 없어진다.

```
src/app/(admin)/admin/transactions/AdminRefundButton.tsx
src/lib/payments.ts  refundBooking / quoteRefund
support_requests.refund_account  ← PG 전환 후 신규 건에는 안 쓰임
```

⚠️ 부분 취소 가능 여부와 기한(보통 원결제일 기준)이 카드사마다 다르다. **위약금 구간이
부분 취소로 표현 가능한지**를 KG 에 먼저 확인할 것. 안 되면 전액 취소 + 재청구가 되는데,
그건 지금 환불 규정(취소환불정책 3조)과 금액이 달라질 수 있다.

### 3-6. 약관·고지

- 회원약관·취소환불정책의 "사매 계좌로 입금" 문구 → 결제 수단 표현으로
- `/trust` 의 「사매 계좌로 받습니다」 절 (line 113 부근)
- 봇 정책 `lib/platform-policy.ts` 10~12행 — 봇이 고객에게 이 말을 그대로 한다
- 전자상거래법상 **결제수단 표시** 의무가 생긴다

> 문안을 고치면 약관 버전이 올라가고 **회원·작가 전원 재동의**다(`policy-version.ts`).
> 알림톡 문안을 건드리면 **템플릿 재심사**다(docs/34) — 전환 일정에 이 리드타임을 넣을 것.

## 4. 전환일 순서 (제안)

1. 스테이징에서 `PAYMENT_MODE=pg` + 웹훅 연결 → 결제 1건 왕복
2. §3-2 네 지면을 `showsBankAccount()` 로 감싸고 배포 (**무통장 상태로 배포** — 화면 변화 없음)
3. §3-3 결제창 연결. 임박 예약 동의가 결제 **앞**인지 확인
4. 약관·알림톡 문안 심사 걸어 두기 (리드타임이 제일 길다)
5. 심사·재동의가 끝난 날 `PAYMENT_MODE=pg` 올리기
6. 첫 결제 1건을 실거래로 확인한 뒤 공지

**2번까지는 지금 해도 된다.** 켜지 않은 채로 감싸기만 하는 거라 화면이 안 바뀐다.

## 5. 지금 해 둔 것

- `lib/payment-mode.ts` — 스위치 + 판별 함수 셋, 테스트 6개
- `/admin/transactions` 가 `showsBankAccount()` 로 계좌 편집기를 감쌌다 (본보기)
- 이 문서

**그 외에는 아무것도 바꾸지 않았다.** `PAYMENT_MODE` 를 안 정하면 전부 지금 그대로다.
