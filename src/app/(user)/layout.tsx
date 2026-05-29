import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/app/actions/auth";
import { SearchBox } from "@/components/user/SearchBox";
import { listConversations, myUnread } from "@/lib/chat";

// 사용자(탐색) 영역 공통 헤더
export default async function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getCurrentUser();

  // 채팅 안읽음 합계 (로그인 시)
  let unreadTotal = 0;
  if (me) {
    const convs = await listConversations();
    unreadTotal = convs.reduce((sum, c) => sum + myUnread(c, me), 0);
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-fg/8 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 sm:px-6 py-3">
          <Link href="/" className="text-xl font-display italic text-brand">
            samae
          </Link>
          <SearchBox />
          <nav className="flex items-center gap-3 text-sm font-kr">
            {me ? (
              <>
                <Link href="/chat" className="relative text-fg/70 hover:text-fg">
                  채팅
                  {unreadTotal > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {unreadTotal}
                    </span>
                  )}
                </Link>
                <Link href="/favorites" className="text-fg/70 hover:text-fg">
                  찜
                </Link>
                <Link href="/studio" className="text-fg/70 hover:text-fg">
                  {me.photographer ? "스튜디오" : "작가 신청"}
                </Link>
                {me.role === "admin" && (
                  <Link href="/admin" className="text-fg/70 hover:text-fg">
                    어드민
                  </Link>
                )}
                <form action={signOut}>
                  <button className="rounded-full bg-fg/[0.06] px-3 py-1 text-fg/70 hover:bg-fg/10">
                    로그아웃
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-full bg-fg px-4 py-1.5 font-semibold text-bg hover:opacity-90"
              >
                로그인
              </Link>
            )}
          </nav>
        </div>
      </header>
      {children}
    </>
  );
}
