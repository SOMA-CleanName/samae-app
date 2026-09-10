// 채팅 부활 (8/26 회의 결정) — 비활성 가드 해제.
// 접근 제어는 각 페이지가 담당한다 (/chat 은 로그인 필수 → /login?next=/chat).
export default function UserChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
