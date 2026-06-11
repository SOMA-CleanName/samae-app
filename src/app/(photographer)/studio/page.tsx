import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listMyBookings, fmtShootAt } from "@/lib/bookings";
import { listMyFees } from "@/lib/payments";

// 작가 스튜디오 홈 — 신청 상태별 분기. 승인 작가는 '할 일' 중심 대시보드.
export default async function StudioHome() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio");

  const ph = me.photographer;

  // 미신청/대기/반려/정지 — 상태 카드만 (레이아웃이 사이드바를 안 씌움)
  if (!ph || ph.status !== "approved") {
    return (
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 font-kr">
        <Link href="/" className="text-sm text-fg/50 hover:text-fg">
          ← 탐색으로
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">작가 스튜디오</h1>

        {!ph && (
          <div className="mt-6 rounded-xl border border-fg/10 p-6">
            <p className="text-sm text-fg/70">
              아직 작가로 등록되지 않았어요. 신청하고 승인받으면 탐색 탭에 노출됩니다.
            </p>
            <Link
              href="/studio/apply"
              className="mt-4 inline-block rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg hover:opacity-90"
            >
              작가 신청하기
            </Link>
          </div>
        )}
        {ph?.status === "pending" && (
          <StatusCard tone="wait" title="승인 대기 중" desc="운영자 검토 후 활동을 시작할 수 있어요. 보통 영업일 기준 1~2일 소요됩니다." displayName={ph.displayName} />
        )}
        {ph?.status === "rejected" && (
          <StatusCard tone="reject" title="신청이 반려되었어요" desc="자세한 사유는 안내 메시지를 확인해주세요." displayName={ph.displayName} />
        )}
        {ph?.status === "suspended" && (
          <StatusCard tone="reject" title="활동이 정지되었어요" desc="문의가 필요하면 운영자에게 연락해주세요." displayName={ph.displayName} />
        )}
      </main>
    );
  }

  // ── 승인 작가 대시보드 ──────────────────────────────────────────
  const [all, fees] = await Promise.all([listMyBookings(), listMyFees()]);
  const mine = all.filter((b) => b.photographer_id === ph.id);
  const now = Date.now();

  // 할 일 버킷
  const received = mine.filter((b) => b.status === "requested" && !b.proposed_by_photographer); // 내가 수락
  const awaitingPay = mine.filter((b) => b.status === "accepted"); // 입금 확인
  const toShoot = mine.filter((b) => b.status === "paid"); // 촬영 완료 표시
  const toDeliver = mine.filter((b) => b.status === "shot"); // 보정본 전달
  const myPending = mine.filter((b) => b.status === "requested" && b.proposed_by_photographer); // 내 제안 대기

  const todos = [
    { label: "받은 예약 제안 수락", count: received.length, href: "/chat", urgent: true },
    { label: "입금 확인 대기", count: awaitingPay.length, href: "/bookings", urgent: true },
    { label: "촬영 완료 표시", count: toShoot.length, href: "/bookings", urgent: false },
    { label: "보정본 전달", count: toDeliver.length, href: "/bookings", urgent: false },
  ].filter((t) => t.count > 0);

  // 다가오는 촬영 (수락/결제 + 미래 일정)
  const upcoming = mine
    .filter((b) => ["accepted", "paid"].includes(b.status) && b.shoot_at && new Date(b.shoot_at).getTime() >= now)
    .sort((a, b) => new Date(a.shoot_at!).getTime() - new Date(b.shoot_at!).getTime())
    .slice(0, 4);

  // 요약
  const activeCount = mine.filter((b) => ["accepted", "paid", "shot", "delivered"].includes(b.status)).length;
  const completedCount = mine.filter((b) => b.status === "completed").length;
  const dueTotal = fees
    .filter((f) => f.status === "accrued" || f.status === "billed")
    .reduce((sum, f) => sum + f.fee_krw, 0);
  const fmt = new Intl.NumberFormat("ko-KR");

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8 font-kr">
      <h1 className="text-2xl font-semibold">대시보드</h1>
      <p className="mt-1 text-sm text-fg/50">
        <b className="text-fg/70">{ph.displayName}</b> 작가님, 오늘도 좋은 촬영 되세요.
      </p>

      {/* 할 일 */}
      <section className="mt-6">
        <h2 className="text-sm font-medium text-fg/70">할 일 {todos.length > 0 && <span className="text-brand">{todos.length}</span>}</h2>
        {todos.length === 0 ? (
          <p className="mt-3 rounded-xl border border-fg/10 p-5 text-sm text-fg/55">
            지금은 처리할 일이 없어요. 🎉
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {todos.map((t) => (
              <li key={t.label}>
                <Link
                  href={t.href}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                    t.urgent
                      ? "border-amber-500/30 bg-amber-500/[0.06] hover:bg-amber-500/[0.1]"
                      : "border-fg/10 hover:border-fg/25"
                  }`}
                >
                  <span className={t.urgent ? "text-amber-800" : ""}>{t.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-fg/[0.08] px-2 py-0.5 text-xs font-semibold">{t.count}</span>
                    <span className="text-xs text-fg/40">→</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {myPending.length > 0 && (
          <p className="mt-2 text-xs text-fg/45">
            내가 보낸 제안 {myPending.length}건이 고객 수락을 기다리고 있어요.
          </p>
        )}
      </section>

      {/* 다가오는 촬영 */}
      <section className="mt-8">
        <h2 className="text-sm font-medium text-fg/70">다가오는 촬영</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-fg/45">예정된 촬영이 없어요.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {upcoming.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/bookings/${b.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-fg/10 px-4 py-3 text-sm hover:border-fg/25"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{fmtShootAt(b.shoot_at)}</span>
                    <span className="block truncate text-xs text-fg/50">
                      {b.user?.display_name || "고객"} · {b.package?.name ?? b.package_snapshot?.name ?? "촬영"}
                      {b.location_text ? ` · ${b.location_text}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-fg/40">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 요약 */}
      <section className="mt-8 grid grid-cols-3 gap-3">
        <Stat label="진행 중" value={`${activeCount}건`} />
        <Stat label="완료 거래" value={`${completedCount}건`} />
        <Stat label="미납 수수료" value={`₩${fmt.format(dueTotal)}`} href="/studio/settlements" tone={dueTotal > 0 ? "brand" : undefined} />
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: string;
  href?: string;
  tone?: "brand";
}) {
  const body = (
    <div className="rounded-xl border border-fg/10 p-4">
      <p className="text-xs text-fg/50">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone === "brand" ? "text-brand" : ""}`}>{value}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
}

function StatusCard({
  tone,
  title,
  desc,
  displayName,
}: {
  tone: "wait" | "reject";
  title: string;
  desc: string;
  displayName: string;
}) {
  const color =
    tone === "wait" ? "border-amber-500/20 bg-amber-500/[0.06]" : "border-brand/20 bg-brand/[0.06]";
  return (
    <div className={`mt-6 rounded-xl border p-6 ${color}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-fg/65">{desc}</p>
      <p className="mt-3 text-xs text-fg/45">작가명: {displayName}</p>
    </div>
  );
}