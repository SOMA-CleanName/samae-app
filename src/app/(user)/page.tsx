import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/app/actions/auth";

// 탐색 홈 (placeholder) — 2단계에서 갤러리·필터로 채움
export default async function ExploreHome() {
  const me = await getCurrentUser();

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-10 font-kr">
      {/* 상단 바 */}
      <header className="flex items-center justify-between">
        <Link href="/" className="text-2xl font-display italic text-brand">
          samae
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {me ? (
            <>
              {me.photographer ? (
                <Link href="/studio" className="text-fg/70 hover:text-fg">
                  작가 스튜디오
                </Link>
              ) : (
                <Link href="/studio" className="text-fg/70 hover:text-fg">
                  작가 신청
                </Link>
              )}
              {me.role === "admin" && (
                <Link href="/admin" className="text-fg/70 hover:text-fg">
                  어드민
                </Link>
              )}
              <span className="text-fg/40">{me.displayName ?? me.email}</span>
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
      </header>

      {/* placeholder 본문 */}
      <section className="mt-16 text-center">
        <h1 className="text-3xl sm:text-4xl font-semibold leading-tight">
          다양한 무드,{"\n"}다양한 작가.
        </h1>
        <p className="mt-3 text-sm text-fg/55">
          탐색 갤러리는 2단계에서 구현됩니다. (지금은 0단계 — 기반·인증 골격)
        </p>
        <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-lg bg-fg/[0.05]" />
          ))}
        </div>
      </section>
    </main>
  );
}
