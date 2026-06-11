// 핀터레스트 톤 인라인 아이콘 — currentColor 상속, 24px 기준 stroke
// 단일 책임: 그리기만 담당, 의미·라우팅은 호출 측에서 결정
type IconProps = { className?: string; filled?: boolean };

const base = "h-6 w-6";

// 홈(집)
export function HomeIcon({ className, filled }: IconProps) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? base}>
      <path d="M11.3 2.3a1 1 0 0 1 1.4 0l8 8A1 1 0 0 1 20 12h-1v8a1 1 0 0 1-1 1h-4v-6h-4v6H6a1 1 0 0 1-1-1v-8H4a1 1 0 0 1-.7-1.7l8-8Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" className={className ?? base}>
      <path d="M4 11.5 12 4l8 7.5M6 10v10h4v-6h4v6h4V10" />
    </svg>
  );
}

// 찜(하트)
export function HeartIcon({ className, filled }: IconProps) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? base}>
      <path d="M12 21s-7.5-4.6-10-9.1C.4 8.9 1.6 5.4 4.8 4.7 7 4.2 8.9 5.3 12 8c3.1-2.7 5-3.8 7.2-3.3 3.2.7 4.4 4.2 2.8 7.2C19.5 16.4 12 21 12 21Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" className={className ?? base}>
      <path d="M12 20s-7-4.3-9.3-8.5C1.3 8.9 2.5 6 5.2 5.5 7.2 5.1 9 6.2 12 8.9c3-2.7 4.8-3.8 6.8-3.4 2.7.5 3.9 3.4 2.5 6C19 15.7 12 20 12 20Z" />
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

// 예약(캘린더)
export function CalendarIcon({ className, filled }: IconProps) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? base}>
      <path d="M7 2v2H5a2 2 0 0 0-2 2v3h18V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7ZM3 10v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9H3Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" className={className ?? base}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3v3M16 3v3" strokeLinecap="round" />
    </svg>
  );
}

// 채팅(말풍선)
export function ChatIcon({ className, filled }: IconProps) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? base}>
      <path d="M12 3c5 0 9 3.4 9 7.6 0 4.2-4 7.6-9 7.6-1 0-2-.1-2.9-.4l-4 1.5a.6.6 0 0 1-.8-.7l.9-3.3C3.6 14.5 3 12.6 3 10.6 3 6.4 7 3 12 3Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" className={className ?? base}>
      <path d="M12 4c4.4 0 8 3 8 6.7 0 3.7-3.6 6.7-8 6.7-.9 0-1.8-.1-2.6-.4l-3.6 1.4.8-3C4.4 14.2 4 12.5 4 10.7 4 7 7.6 4 12 4Z" />
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
