import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

// 작가 스튜디오 (placeholder) — 1단계에서 프로필·패키지·포트폴리오로 채움
export default async function StudioHome() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio");

  const ph = me.photographer;

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 font-kr">
      <Link href="/" className="text-sm text-fg/50 hover:text-fg">
        ← 탐색으로
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">작가 스튜디오</h1>

      {!ph ? (
        <div className="mt-6 rounded-xl border border-fg/10 p-6">
          <p className="text-sm text-fg/70">
            아직 작가로 등록되지 않았어요. 작가 신청 플로우는 <b>1단계</b>에서 구현됩니다.
          </p>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-fg/10 p-6">
          <p className="text-sm">
            <b>@{ph.handle}</b> · 상태:{" "}
            <span className="rounded-full bg-fg/[0.06] px-2 py-0.5 text-xs">
              {ph.status}
            </span>
          </p>
          <p className="mt-3 text-sm text-fg/60">
            프로필·패키지·포트폴리오·가능시간 관리는 1단계에서 추가됩니다.
          </p>
        </div>
      )}
    </main>
  );
}
