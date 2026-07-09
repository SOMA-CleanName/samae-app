// '내 문의' 표시용 타입/라벨 — 클라이언트에서도 쓰므로 server-only 의존(admin·cookies) 없이 둔다.

export type MyInquiry = {
  id: string;
  createdLabel: string; // "2026년 7월 9일 16시 27분" (KST, 서버 계산 — 하이드레이션 안전)
  status: string;
  photoThumb: string | null;
  phone: string | null;
  instagram: string | null;
  kakao: string | null;
  extraContact: string | null;
  partySize: number | null;
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
    case "contacted":
      return { label: "연락 진행 중", tone: "active" };
    case "converted":
      return { label: "예약 전환", tone: "done" };
    case "closed":
      return { label: "종료", tone: "done" };
    default:
      return { label: "접수됨", tone: "wait" }; // new
  }
}
