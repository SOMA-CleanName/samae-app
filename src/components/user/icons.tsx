// 핀터레스트 톤 인라인 아이콘 — currentColor 상속, 24px 기준 stroke
// 단일 책임: 그리기만 담당, 의미·라우팅은 호출 측에서 결정
type IconProps = { className?: string; filled?: boolean };

const base = "h-6 w-6";

// 홈(집) — Lucide house 기반
export function HomeIcon({ className, filled }: IconProps) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? base}>
      <path d="M11.4 2.8a1 1 0 0 1 1.2 0l8 6.5c.25.2.4.5.4.82V19a2 2 0 0 1-2 2h-3.5v-5.5a1 1 0 0 0-1-1h-3a1 1 0 0 0-1 1V21H5a2 2 0 0 1-2-2v-8.88c0-.32.15-.62.4-.82z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className ?? base}>
      <path d="M15 21v-7a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v7" />
      <path d="M3 10.2a2 2 0 0 1 .7-1.52l7-5.99a2 2 0 0 1 2.6 0l7 5.99a2 2 0 0 1 .7 1.52V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

// 찜(하트) — Lucide heart 기반
export function HeartIcon({ className, filled }: IconProps) {
  const d =
    "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7z";
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? base}>
      <path d={d} />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className ?? base}>
      <path d={d} />
    </svg>
  );
}

// 만들기(+)
export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className={className ?? base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

// 스튜디오(카메라)
export function CameraIcon({ className, filled }: IconProps) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? base}>
      <path d="M9 3 7.8 5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2.8L15 3H9Zm3 5.5A4.5 4.5 0 1 1 7.5 13 4.5 4.5 0 0 1 12 8.5Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" className={className ?? base}>
      <path d="M4 8a2 2 0 0 1 2-2h1.6L9 4h6l1.4 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

// 예약(캘린더) — Lucide calendar 기반
export function CalendarIcon({ className, filled }: IconProps) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? base}>
      <path d="M7 2v2H5a2 2 0 0 0-2 2v3h18V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7ZM3 10v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9H3Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className ?? base}>
      <path d="M8 2v4M16 2v4" />
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

// 채팅(말풍선) — Lucide message-circle 기반
export function ChatIcon({ className, filled }: IconProps) {
  const d = "M7.9 20A9 9 0 1 0 4 16.1L2 22z";
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? base}>
      <path d={d} />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className ?? base}>
      <path d={d} />
    </svg>
  );
}

// 뒤로 가기(왼쪽 화살표)
export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-5 w-5"}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

// 캐러셀 이전/다음(<, >)
export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-5 w-5"}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-5 w-5"}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

// 닫기(X) — 모달·시트
export function XIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-5 w-5"}>
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  );
}

// 여러 장(스택) — 게시물에 사진이 여러 개일 때. ⧉ 대체
export function LayersIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" className={className ?? "h-4 w-4"}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 4H6a2 2 0 0 0-2 2v10" strokeLinecap="round" />
    </svg>
  );
}

// 빈 프로필(사람) — 비로그인 아바타 자리. Lucide user 기반
export function UserIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className ?? base}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

// 어드민(방패)
export function ShieldIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" className={className ?? base}>
      <path d="M12 3 5 6v5c0 4 3 7 7 8 4-1 7-4 7-8V6l-7-3Z" />
    </svg>
  );
}

// 알림(종)
export function BellIcon({ className, filled }: IconProps) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? base}>
      <path d="M12 2a6 6 0 0 0-6 6c0 3.1-.8 5-1.6 6.1-.5.7 0 1.7.9 1.7h13.4c.9 0 1.4-1 .9-1.7C18.8 13 18 11.1 18 8a6 6 0 0 0-6-6Zm0 20a2.8 2.8 0 0 0 2.7-2h-5.4A2.8 2.8 0 0 0 12 22Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" className={className ?? base}>
      <path d="M6 8a6 6 0 0 1 12 0c0 3.1.8 5 1.6 6.1.5.7 0 1.7-.9 1.7H5.3c-.9 0-1.4-1-.9-1.7C5.2 13 6 11.1 6 8Z" />
      <path d="M9.5 20a2.6 2.6 0 0 0 5 0" strokeLinecap="round" />
    </svg>
  );
}

// 검색(돋보기)
export function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className ?? "h-5 w-5"}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

// 더보기(점 세 개)
export function MoreIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? "h-5 w-5"}>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

// 펼침(아래 화살표)
export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-4 w-4"}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// 평점(별) — filled 기본. ⭐/★ 이모지 대체
export function StarIcon({ className, filled = true }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      strokeLinejoin="round"
      className={className ?? "h-4 w-4"}
    >
      <path d="m12 3 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8 6.8 19l1-5.8L3.6 9.1l5.8-.8L12 3Z" />
    </svg>
  );
}

// 위치(핀) — 📍 이모지 대체
export function MapPinIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" className={className ?? "h-4 w-4"}>
      <path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10Z" />
      <circle cx="12" cy="11" r="2.2" />
    </svg>
  );
}

// 확인(체크) — ✅ 이모지 대체
export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-4 w-4"}>
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

// 보내기(종이비행기) — 채팅 전송. Lucide send 기반
export function SendIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-5 w-5"}>
      <path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.63l-19 6.5a.5.5 0 0 0-.02.94l7.93 3.18a2 2 0 0 1 1.11 1.11z" />
      <path d="m21.85 2.15-10.94 10.94" />
    </svg>
  );
}

// 이미지(사진) — 사진 보내기. Lucide image 기반
export function ImageIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" className={className ?? "h-5 w-5"}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <circle cx="9" cy="9" r="1.6" />
      <path d="m21 16-4.5-4.5L6 21" strokeLinecap="round" />
    </svg>
  );
}

// 상담 정보(클립보드) — 📋 이모지 대체. Lucide clipboard-list 기반
export function ClipboardIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" className={className ?? "h-5 w-5"}>
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" strokeLinecap="round" />
      <path d="M9 12h6M9 16h4" strokeLinecap="round" />
    </svg>
  );
}

// 메일(봉투) — 이메일 인증 안내. Lucide mail 기반
export function MailIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-5 w-5"}>
      <rect x="2" y="4" width="20" height="16" rx="2.5" />
      <path d="m3 7 8.2 5.5a1.5 1.5 0 0 0 1.6 0L21 7" />
    </svg>
  );
}

// 송금/결제(지갑) — 💸 이모지 대체. Lucide wallet 기반
export function WalletIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-5 w-5"}>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

// 출장(자동차) — 🚗 이모지 대체. Lucide car 기반
export function CarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-5 w-5"}>
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.6-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  );
}

// 보기 옵션(슬라이더) — 가격 표시 등 탐색 옵션 메뉴 트리거
export function SlidersIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className ?? "h-5 w-5"}>
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" />
      <circle cx="16" cy="6" r="2.2" />
      <circle cx="8" cy="12" r="2.2" />
      <circle cx="14" cy="18" r="2.2" />
    </svg>
  );
}
