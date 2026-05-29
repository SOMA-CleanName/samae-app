import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

// 운영자 어드민 (placeholder) — 작가 승인·거래·정산 모니터링은 이후 단계
export default async function AdminHome() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/admin");
  if (me.role !== "admin") redirect("/"); // 운영자 아니면 차단

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-10 font-kr">
      <Link href="/" className="text-sm text-fg/50 hover:text-fg">
        ← 탐색으로
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">운영자 어드민</h1>
      <p className="mt-3 text-sm text-fg/60">
        작가 승인 · 거래/정산 모니터링 · 분쟁 처리. 각 기능은 해당 단계에서 구현됩니다.
      </p>
      <ul className="mt-6 grid gap-2 text-sm">
        {["작가 승인 (1단계)", "거래 모니터링 (4단계)", "정산 처리 (5단계)", "분쟁 (5단계)"].map(
          (t) => (
            <li key={t} className="rounded-lg border border-fg/10 px-4 py-3 text-fg/70">
              {t}
            </li>
          )
        )}
      </ul>
    </main>
  );
}
