import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listMyAcceptedInquiries } from "@/lib/inquiries";

// 작가 수수료 내역 — 리드(문의) 언락 모델.
// 작가가 해제 신청한 리드마다 건당 입금액(deposit_amount_krw)이 발생하며,
// 운영진 입금 확인(confirmed) 전이면 '입금 대기', 확인되면 '납부 완료'.
// 사용자→작가 촬영비는 오프플랫폼(직접 협의)이라 플랫폼이 보관/정산하지 않는다.
export default async function FeesPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/settlements");
  if (!me.photographer) redirect("/studio");

  const leads = await listMyAcceptedInquiries();
  const fmt = new Intl.NumberFormat("ko-KR");

  // 입금 대기(미확인) vs 납부 완료(입금 확인) 합계
  const dueTotal = leads
    .filter((l) => !l.confirmed)
    .reduce((sum, l) => sum + l.deposit_amount_krw, 0);
  const paidTotal = leads
    .filter((l) => l.confirmed)
    .reduce((sum, l) => sum + l.deposit_amount_krw, 0);

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 font-kr">
      <Link href="/studio" className="text-sm text-fg/50 hover:text-fg">
        ← 스튜디오
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">수수료 내역</h1>
      <p className="mt-1 text-xs text-fg/45">
        해제 신청한 리드마다 건당 입금액이 발생해요 · 운영진 입금 확인 시 연락처가 공개됩니다
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-fg/10 p-4">
          <p className="text-xs text-fg/50">입금 대기</p>
          <p className="mt-1 text-lg font-semibold text-brand">₩{fmt.format(dueTotal)}</p>
        </div>
        <div className="rounded-xl border border-fg/10 p-4">
          <p className="text-xs text-fg/50">납부 완료</p>
          <p className="mt-1 text-lg font-semibold text-success">₩{fmt.format(paidTotal)}</p>
        </div>
      </div>

      {leads.length === 0 ? (
        <p className="mt-6 rounded-xl border border-fg/10 p-6 text-sm text-fg/60">
          아직 해제 신청한 리드가 없어요. 문의 리스트에서 연락처를 해제하면 여기에 표시됩니다.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {leads.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-fg/10 px-4 py-3 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{l.display_name || "고객"}</span>
                <span className="block text-xs text-fg/50">
                  {l.confirmed ? "납부 완료" : "입금 대기"}
                  {l.purpose ? ` · ${l.purpose}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right font-semibold">
                ₩{fmt.format(l.deposit_amount_krw)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
