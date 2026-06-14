"use client";

import { leaveConversation } from "./actions";

// 채팅방 나가기 버튼 — 확인 후 서버 액션 호출(대화·상담정보 삭제)
export function LeaveButton({ conversationId }: { conversationId: string }) {
  return (
    <form
      action={leaveConversation}
      onSubmit={(e) => {
        if (!confirm("이 채팅방을 나갈까요? 주고받은 대화와 상담 정보가 삭제되며 되돌릴 수 없어요.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      <button
        type="submit"
        className="shrink-0 rounded-full px-2 py-1 text-caption text-faint transition-colors hover:bg-fg/[0.05] hover:text-brand"
        aria-label="채팅방 나가기"
      >
        나가기
      </button>
    </form>
  );
}
