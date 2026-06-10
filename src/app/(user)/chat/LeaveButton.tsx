"use client";

import { leaveConversation } from "./actions";

// 채팅방 나가기 버튼 — 확인 후 서버 액션 호출(내 쪽에서만 숨김)
export function LeaveButton({ conversationId }: { conversationId: string }) {
  return (
    <form
      action={leaveConversation}
      onSubmit={(e) => {
        if (!confirm("이 채팅방을 나갈까요? 새 메시지가 오면 다시 표시돼요.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      <button
        type="submit"
        className="rounded-full px-2 py-1 text-xs text-fg/40 hover:bg-fg/[0.05] hover:text-brand"
        aria-label="채팅방 나가기"
      >
        나가기
      </button>
    </form>
  );
}
