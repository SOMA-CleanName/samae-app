"use client";

// 환불·취소 정책 — 고객이 입금하기 직전에 보는 유일한 안내다.
//
// 두 자리에 나온다: 예약 카드의 입금 단계, 그리고 수락 직후 뜨는 입금 다이얼로그.
// 문구가 갈라지면 어느 쪽을 읽었느냐에 따라 고객이 기대하는 환불이 달라지므로
// 한 컴포넌트로 묶어 둔다.
//
// 규정의 진실은 docs/32-refund-policy.md, 계산은 lib/refund.ts.
// 숫자를 바꿔야 하면 문서 → refund.ts → 이 문구 순서로 함께 고칠 것.

export function PolicyNote() {
  return (
    <div className="mt-3 rounded-xl bg-surface-2 p-3">
      <p className="text-caption font-semibold text-fg">환불·취소 정책</p>
      <ul className="mt-1.5 flex list-none flex-col gap-1 text-caption leading-relaxed text-muted">
        <li>· 입금 전에는 언제든 무료로 취소할 수 있어요.</li>
        <li>
          · 입금 후 <b className="text-fg">24시간 이내</b>면 전액 환불돼요.
        </li>
        <li>
          · 그 뒤로는 촬영 <b className="text-fg">7일 전까지 50%</b> 환불이에요.
          작가님과 연락처를 주고받은 뒤에도 50%예요.
        </li>
        <li>
          · <b className="text-fg">촬영 7일 이내에는 환불이 어려워요.</b> 작가님이 그 날짜를
          비워두셨기 때문이에요.
        </li>
        <li>
          · 태풍·지진처럼 <b className="text-fg">이동이 불가능한 상황</b>이면 날짜를 미루거나
          전액 환불해드려요.
        </li>
        <li>
          · <b className="text-fg">작가 개인 계좌로의 직접 송금은 보호받을 수 없어요.</b> 반드시 위
          사매 계좌로 보내주세요.
        </li>
      </ul>
    </div>
  );
}

