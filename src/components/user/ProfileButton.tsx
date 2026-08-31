import Link from "next/link";

/**
 * 프로필 버튼 — 홈 상단 오른쪽.
 *
 * 로그인 여부와 상관없이 **항상** 자리를 지킨다.
 *   · 로그인함  → 아바타(없으면 사람 아이콘) · 설정으로
 *   · 안 함     → 빈 프로필 · 로그인/가입으로
 *
 * 로그인했을 때만 보이면 "여기 뭔가 있었나?" 싶게 자리가 흔들린다.
 * 비로그인에게는 이 자리가 가입 진입점이기도 하다.
 */
export function ProfileButton({
  loggedIn,
  avatarUrl,
}: {
  loggedIn: boolean;
  avatarUrl?: string | null;
}) {
  return (
    <Link
      href={loggedIn ? "/settings" : "/login"}
      aria-label={loggedIn ? "내 계정" : "로그인 / 회원가입"}
      // 테두리를 진한 선으로. 기본 line 은 배경과 대비가 약해 버튼이 안 보였다.
      className="pb-btn grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-line-strong bg-surface text-fg shadow-sm transition-colors hover:border-brand hover:text-brand"
    >
      {loggedIn && avatarUrl ? (
        // 원격 도메인이 next.config 에 없을 수 있어 next/image 대신 <img>
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="9" r="3.2" />
          <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
        </svg>
      )}
    </Link>
  );
}
