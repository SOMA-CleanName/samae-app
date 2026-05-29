import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  fetchPhotographerByHandle,
  fetchPhotographerPackages,
} from "@/lib/discovery";
import { fmtShootAt } from "@/lib/bookings";
import { createBooking } from "@/app/actions/bookings";

// 예약 요청 폼
export default async function BookPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=/photographers/${handle}/book`);

  const ph = await fetchPhotographerByHandle(handle);
  if (!ph) notFound();
  if (me.photographer?.id === ph.id) redirect("/studio");

  const supabase = await createClient();
  const [packages, slotsRes] = await Promise.all([
    fetchPhotographerPackages(ph.id),
    supabase
      .from("availability")
      .select("id, start_at, end_at")
      .eq("photographer_id", ph.id)
      .eq("is_booked", false)
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true }),
  ]);
  const slots = slotsRes.data ?? [];
  const fmt = new Intl.NumberFormat("ko-KR");

  return (
    <main className="mx-auto max-w-lg px-4 sm:px-6 py-8 font-kr">
      <Link href={`/photographers/${handle}`} className="text-sm text-fg/50 hover:text-fg">
        ← {ph.display_name || `@${ph.handle}`}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">예약 요청</h1>

      {packages.length === 0 || slots.length === 0 ? (
        <p className="mt-6 rounded-xl border border-fg/10 p-6 text-sm text-fg/60">
          {packages.length === 0
            ? "아직 등록된 패키지가 없어요."
            : "예약 가능한 시간이 없어요. 작가에게 채팅으로 문의해보세요."}
        </p>
      ) : (
        <form action={createBooking} className="mt-6 flex flex-col gap-5">
          <input type="hidden" name="photographerId" value={ph.id} />

          {/* 패키지 선택 */}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">패키지</legend>
            {packages.map((p, i) => (
              <label key={p.id} className="flex items-center gap-3 rounded-xl border border-fg/15 px-4 py-3 text-sm has-[:checked]:border-fg">
                <input type="radio" name="packageId" value={p.id} defaultChecked={i === 0} required />
                <span className="flex-1">
                  <b>{p.name}</b>
                  <span className="block text-xs text-fg/50">
                    {p.duration_min}분 · 보정본 {p.edited_count}장
                  </span>
                </span>
                <span className="font-semibold">₩{fmt.format(p.price_krw)}</span>
              </label>
            ))}
          </fieldset>

          {/* 시간 선택 */}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">희망 시간</legend>
            {slots.map((s, i) => (
              <label key={s.id} className="flex items-center gap-3 rounded-xl border border-fg/15 px-4 py-3 text-sm has-[:checked]:border-fg">
                <input type="radio" name="availabilityId" value={s.id} defaultChecked={i === 0} required />
                <span>{fmtShootAt(s.start_at)}</span>
              </label>
            ))}
          </fieldset>

          {/* 장소·메모 */}
          <label className="flex flex-col gap-1 text-sm font-medium">
            촬영 장소
            <input name="locationText" placeholder="예: 성수동 카페거리" className="rounded-xl border border-fg/15 bg-white px-4 py-3 text-sm font-normal outline-none focus:border-fg/40" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            메모 (선택)
            <textarea name="memo" rows={3} placeholder="원하는 컨셉·분위기를 적어주세요." className="rounded-xl border border-fg/15 bg-white px-4 py-3 text-sm font-normal outline-none focus:border-fg/40" />
          </label>

          <button className="rounded-xl bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90">
            예약 요청하기
          </button>
          <p className="text-center text-xs text-fg/45">
            요청 후 작가가 수락하면 결제 단계로 이어집니다.
          </p>
        </form>
      )}
    </main>
  );
}
