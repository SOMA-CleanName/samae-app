import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addSlot, deleteSlot } from "./actions";

type Slot = {
  id: string;
  start_at: string;
  end_at: string;
  is_booked: boolean;
};

// KST 기준 표시
function fmt(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

// 가능 시간 관리
export default async function AvailabilityPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/availability");
  if (!me.photographer) redirect("/studio");

  const supabase = await createClient();
  const { data } = await supabase
    .from("availability")
    .select("id, start_at, end_at, is_booked")
    .eq("photographer_id", me.photographer.id)
    .order("start_at", { ascending: true });

  const slots = (data ?? []) as Slot[];

  return (
    <main className="mx-auto max-w-xl px-4 sm:px-6 py-10 font-kr">
      <Link href="/studio" className="text-sm text-fg/50 hover:text-fg">
        ← 스튜디오
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">가능 시간</h1>
      <p className="mt-1 text-sm text-fg/55">
        예약 가능한 시간대를 등록하세요. 유저가 예약 시 선택합니다.
      </p>

      {/* 슬롯 추가 */}
      <form
        action={addSlot}
        className="mt-6 rounded-xl border border-fg/15 p-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <label className="flex flex-col gap-1 text-xs text-fg/55">
          시작
          <input type="datetime-local" name="start" required className="rounded-lg border border-fg/15 bg-white px-3 py-2 text-sm text-fg outline-none focus:border-fg/40" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg/55">
          종료
          <input type="datetime-local" name="end" required className="rounded-lg border border-fg/15 bg-white px-3 py-2 text-sm text-fg outline-none focus:border-fg/40" />
        </label>
        <button className="rounded-full bg-fg px-5 py-2 text-sm font-semibold text-bg hover:opacity-90">
          추가
        </button>
      </form>

      {/* 슬롯 목록 */}
      <section className="mt-8">
        <h2 className="text-sm font-medium text-fg/70">등록된 슬롯 {slots.length}</h2>
        {slots.length === 0 ? (
          <p className="mt-3 text-sm text-fg/45">아직 등록된 슬롯이 없어요.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {slots.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-fg/10 px-4 py-3 text-sm"
              >
                <span>
                  {fmt(s.start_at)} ~{" "}
                  {new Intl.DateTimeFormat("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Seoul",
                  }).format(new Date(s.end_at))}
                </span>
                {s.is_booked ? (
                  <span className="rounded-full bg-fg/10 px-2 py-0.5 text-[11px] text-fg/55">
                    예약됨
                  </span>
                ) : (
                  <form action={deleteSlot}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="rounded-full px-3 py-1 text-xs text-brand hover:bg-brand/[0.06]">
                      삭제
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
