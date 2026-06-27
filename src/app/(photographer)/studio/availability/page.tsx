import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addBlock, removeBlock } from "./actions";
import { WeeklyGrid } from "./WeeklyGrid";

const WD = ["일", "월", "화", "수", "목", "금", "토"];

// KST 날짜/시간 포맷
function kstDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(iso));
}
function kstTime(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}
function kstWeekdayIndex(iso: string) {
  const short = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Seoul" }).format(
    new Date(iso)
  );
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(short);
}

type Rule = { id: string; weekday: number; start_time: string; end_time: string };
type Block = { id: string; start_at: string; end_at: string };
type Booking = { id: string; shoot_at: string; location_text: string | null; package_snapshot: { name?: string } | null };

export default async function AvailabilityPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/availability");
  if (!me.photographer) redirect("/studio");

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const [rulesRes, blocksRes, bookingsRes] = await Promise.all([
    supabase
      .from("availability_rules")
      .select("id, weekday, start_time, end_time")
      .eq("photographer_id", me.photographer.id)
      .order("weekday")
      .order("start_time"),
    supabase
      .from("availability_blocks")
      .select("id, start_at, end_at")
      .eq("photographer_id", me.photographer.id)
      .gte("end_at", nowIso)
      .order("start_at"),
    supabase
      .from("bookings")
      .select("id, shoot_at, location_text, package_snapshot")
      .eq("photographer_id", me.photographer.id)
      .in("status", ["accepted", "paid", "shot", "delivered", "completed"])
      .not("shoot_at", "is", null)
      .order("shoot_at"),
  ]);

  const rules = (rulesRes.data ?? []) as Rule[];
  const blocks = (blocksRes.data ?? []) as Block[];
  const bookings = (bookingsRes.data ?? []) as Booking[];

  // 이번 달 달력
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const [yy, mm] = todayStr.split("-").map(Number);
  const daysInMonth = new Date(yy, mm, 0).getDate();
  const firstWeekday = kstWeekdayIndex(`${yy}-${String(mm).padStart(2, "0")}-01T12:00:00+09:00`);
  const bookedDays = new Set(
    bookings
      .map((b) => kstDate(b.shoot_at))
      .filter((d) => d.startsWith(`${yy}-${String(mm).padStart(2, "0")}`))
      .map((d) => Number(d.split("-")[2]))
  );

  const upcoming = bookings.filter((b) => b.shoot_at >= nowIso);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 font-kr sm:px-6">
      <Link href="/studio" className="text-sm text-fg/50 hover:text-fg">
        ← 스튜디오
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">일정 관리</h1>
      <p className="mt-1 text-sm text-fg/55">
        주 단위로 가능한 시간을 정하고, 특정 시간을 막을 수 있어요. 예약이 수락되면 그 시간은 자동으로 막힙니다.
      </p>

      {/* ── 주간 반복 규칙 (격자) ──────────────────── */}
      <section className="mt-8">
        <h2 className="text-sm font-medium text-fg/70">주간 가능시간</h2>
        <div className="mt-3">
          <WeeklyGrid initialRules={rules} />
        </div>
      </section>

      {/* ── 특정일 차단 ───────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-sm font-medium text-fg/70">특정 시간 차단</h2>
        {blocks.length === 0 ? (
          <p className="mt-2 text-sm text-fg/45">차단된 시간이 없어요.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {blocks.map((b) => (
              <li key={b.id} className="flex items-center justify-between rounded-lg border border-fg/10 px-3 py-2.5 text-sm">
                <span>
                  {kstDate(b.start_at)} · {kstTime(b.start_at)}–{kstTime(b.end_at)}
                </span>
                <form action={removeBlock}>
                  <input type="hidden" name="id" value={b.id} />
                  <button className="rounded-full px-3 py-1 text-xs text-brand hover:bg-brand/[0.06]">해제</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addBlock} className="mt-3 grid grid-cols-[1.3fr_1fr_1fr_auto] items-end gap-2 rounded-xl border border-fg/15 p-3">
          <label className="flex flex-col gap-1 text-xs text-fg/55">
            날짜
            <input type="date" name="date" required className="rounded-lg border border-fg/15 bg-surface px-2 py-2 text-sm outline-none focus:border-fg/40" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg/55">
            시작
            <input type="time" name="start_time" required className="rounded-lg border border-fg/15 bg-surface px-2 py-2 text-sm outline-none focus:border-fg/40" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg/55">
            종료
            <input type="time" name="end_time" required className="rounded-lg border border-fg/15 bg-surface px-2 py-2 text-sm outline-none focus:border-fg/40" />
          </label>
          <button className="rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg hover:opacity-90">차단</button>
        </form>
      </section>

      {/* ── 이번 달 예약 달력 ─────────────────────── */}
      <section className="mt-8">
        <h2 className="text-sm font-medium text-fg/70">{yy}년 {mm}월 예약</h2>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs">
          {WD.map((d) => (
            <div key={d} className="py-1 font-medium text-fg/45">{d}</div>
          ))}
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isToday = day === Number(todayStr.split("-")[2]);
            const booked = bookedDays.has(day);
            return (
              <div
                key={day}
                className={`aspect-square rounded-lg py-1 ${
                  booked ? "bg-fg text-bg font-semibold" : "bg-fg/[0.03] text-fg/70"
                } ${isToday ? "ring-2 ring-warning" : ""}`}
              >
                {day}
              </div>
            );
          })}
        </div>

        {/* 다가오는 예약 */}
        <h3 className="mt-6 text-sm font-medium text-fg/70">다가오는 예약 {upcoming.length}</h3>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-fg/45">예정된 예약이 없어요.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {upcoming.map((b) => (
              <li key={b.id} className="rounded-lg border border-fg/10 px-3 py-2.5 text-sm">
                <span className="font-medium">
                  {kstDate(b.shoot_at)} {kstTime(b.shoot_at)}
                </span>
                <span className="text-fg/55">
                  {" · "}
                  {b.package_snapshot?.name ?? "촬영"}
                  {b.location_text ? ` · 📍 ${b.location_text}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
