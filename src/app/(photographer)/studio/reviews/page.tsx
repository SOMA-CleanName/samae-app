import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listReviewsForPhotographer } from "@/lib/reviews";
import { fmtShootAt } from "@/lib/bookings";

export const dynamic = "force-dynamic";

// 작가 후기 모아보기 — 내게 귀속된 모든 후기를 한 곳에서. 작성·수정은 고객이 예약창에서.
export default async function StudioReviewsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/reviews");
  if (!me.photographer) redirect("/studio");

  const reviews = await listReviewsForPhotographer(me.photographer.id);
  const count = reviews.length;
  const avg = count > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8 font-kr">
      <h1 className="text-2xl font-semibold">후기</h1>
      <p className="mt-1 text-sm text-fg/50">촬영을 마친 고객이 남긴 후기예요.</p>

      {/* 요약 */}
      <div className="mt-5 flex items-center gap-4 rounded-xl border border-fg/10 p-5">
        <div className="text-center">
          <p className="text-3xl font-semibold leading-none">{avg.toFixed(1)}</p>
          <p className="mt-1 text-warning" aria-hidden>
            {"★".repeat(Math.round(avg))}
            <span className="text-fg/20">{"★".repeat(5 - Math.round(avg))}</span>
          </p>
        </div>
        <div className="text-sm text-fg/60">
          <p>
            총 <b className="text-fg">{count}</b>개의 후기
          </p>
          <p className="mt-0.5 text-xs text-fg/45">평균 별점은 프로필에 공개돼요.</p>
        </div>
      </div>

      {/* 목록 */}
      {count === 0 ? (
        <p className="mt-10 text-center text-sm text-fg/45">아직 받은 후기가 없어요.</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-xl border border-fg/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-warning text-sm">
                  {"★".repeat(r.rating)}
                  <span className="text-fg/20">{"★".repeat(5 - r.rating)}</span>
                </span>
                <span className="text-xs text-fg/40">
                  {new Date(r.created_at).toLocaleDateString("ko-KR")}
                </span>
              </div>

              {r.body && <p className="mt-2 text-sm text-fg/80">{r.body}</p>}

              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg/45">
                <span>{r.user?.display_name || "고객"}</span>
                <span aria-hidden>·</span>
                <span>{r.booking?.package_snapshot?.name ?? "촬영"}</span>
                {r.booking?.shoot_at && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{fmtShootAt(r.booking.shoot_at)}</span>
                  </>
                )}
                <Link
                  href={`/bookings/${r.booking_id}`}
                  className="ml-auto text-fg/45 underline hover:text-fg"
                >
                  예약 보기
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
