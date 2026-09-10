// '내 문의' 표시용 타입/라벨 — 클라이언트에서도 쓰므로 server-only 의존(admin·cookies) 없이 둔다.

export type MyInquiry = {
  id: string;
  createdDate: string; // "2026년 7월 8일" (KST)
  createdTime: string; // "14:11 제출" (KST) — 서버 계산이라 하이드레이션 안전
  status: string;
  photoThumb: string | null;
  /** 채팅방 재진입용 — /inquiry/bot?photographerId&photoId */
  photographerId: string;
  photoId: string | null;
  photographerName: string | null;
  partySize: string | null;
  purpose: string;
  preferredDate: string;
  region: string;
  note: string | null;
  refImages: string[];
};

// 상태 → 사용자용 라벨/톤
export function inquiryStatusLabel(status: string): { label: string; tone: "wait" | "active" | "done" } {
  switch (status) {
    case "accepted":
      return { label: "작가 확인함", tone: "active" };
    case "confirmed":
      return { label: "연락 진행 중", tone: "active" };
    case "shot":
      return { label: "촬영 완료", tone: "done" };
    case "refund_requested":
      return { label: "환불 신청", tone: "active" };
    case "expired":
      return { label: "만료됨", tone: "done" };
    default:
      return { label: "접수됨", tone: "wait" }; // new
  }
}
