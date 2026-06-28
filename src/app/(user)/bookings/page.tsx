import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  listMyBookings,
  getConversationMap,
  STATUS_LABEL,
  statusTone,
  fmtShootAt,
  type BookingRow,
  type BookingStatus,
} from "@/lib/bookings";

export const dynamic = "force-dynamic";

// 확정(작가 수락 이후) 예약 상태만 목록에 노출 — 요청중/거절/취소는 채팅방에서만 (R3)
const CONFIRMED_STATUSES: BookingStatus[] = [
  "accepted", "paid", "shot", "delivered", "completed", "refunded",
];
function onlyConfirmed(rows: BookingRow[]): BookingRow[] {
  return rows.filter((b) => CONFIRMED_STATUSES.includes(b.status));
}

// 상태 그룹 — 진행 중 / 완료 / 환불 (B2)
const BUCKETS: { label: string; statuses: BookingStatus[] }[] = [
  { label: "진행 중", statuses: ["accepted", "paid", "shot", "delivered"] },
  { label: "완료", statuses: ["completed"] },
  { label: "환불", statuses: ["refunded"] },
];

// 예약 목록 (구매자/작가 통합) — 확정 예약만, 상태별 그룹
export default async function BookingsPage() {
  // me·목록·대화맵 병렬 (내부적으로 getCurrentUser 는 React.cache 로 1회만 실제 조회)
  const [me, all, convMap] = await Promise.all([
    getCurrentUser(),
    listMyBookings(),
    getConversationMap(),
  ]);
  if (!me) redirect("/login?next=/bookings");
  const asBuyer = onlyConfirmed(all.filter((b) => b.user_id === me.id));
  const asPhotographer = onlyConfirmed(
    all.filter((b) => me.photographer && b.photographer_id === me.photographer.id)
  );

  // 대기 중(요청됨) 제안 수 — 확정 목록엔 없지만 채팅에서 진행 중
  const pendingCount = all.filter(
    (b) =>
      b.status === "requested" &&
      (b.user_id === me.id || (me.photographer && b.photographer_id === me.photographer.id))
  ).length;

  return (
    <main className="mx-auto max-w-2xl px-3.5 sm:px-5 py-8 font-kr">
      <h1 className="text-2xl font-semibold">예약</h1>
      <p className="mt-1 text-sm text-fg/50">확정된 예약만 표시돼요. 요청·취소 내역은 채팅방에서 확인할 수 있어요.</p>

      {pendingCount > 0 && (
        <Link
          href="/chat"
          className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning/[0.06] px-4 py-3 text-sm transition-colors hover:bg-warning/[0.12]"
        >
          <span className="text-warning">
            대기 중인 예약 제안 <strong>{pendingCount}건</strong>이 있어요.
          </span>
          <span className="shrink-0 text-xs text-warning/80">채팅에서 확인 →</span>
        </Link>
      )}

      {me.photographer && (
        <RoleBlock title="받은 예약" rows={asPhotographer} role="photographer" convMap={convMap} />
      )}
      <RoleBlock title="내 예약" rows={asBuyer} role="buyer" convMap={convMap} />
    </main>
  );
}

// 역할(받은/내) 블록 — 안에서 상태 그룹으로 다시 나눈다
function RoleBlock({
  title,
  rows,
  role,
  convMap,
}: {
  title: string;
  rows: BookingRow[];
  role: "buyer" | "photographer";
  convMap: Map<string, string>;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-fg/70">
        {title} {rows.length > 0 && <span className="text-fg/40">{rows.length}</span>}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-fg/45">아직 없어요.</p>
      ) : (
        BUCKETS.map((bucket) => {
          const group = rows.filter((b) => bucket.statuses.includes(b.status));
          if (group.length === 0) return null;
          return (
            <div key={bucket.label} className="mt-4">
              <p className="text-xs font-medium text-fg/45">
                {bucket.label} · {group.length}
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {group.map((b) => (
                  <BookingItem key={b.id} b={b} role={role} convMap={convMap} />
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}

// 예약 행 — 상세 링크 + 채팅 바로가기(B1)
function BookingItem({
  b,
  role,
  convMap,
}: {
  b: BookingRow;
  role: "buyer" | "photographer";
  convMap: Map<string, string>;
}) {
  const convId = convMap.get(`${b.user_id}:${b.photographer_id}`);
  const counterpart =
    role === "buyer" ? b.photographer?.display_name || "작가" : b.user?.display_name || "고객";

  return (
    <li className="flex items-stretch gap-2">
      <Link
        href={`/bookings/${b.id}`}
        className="block flex-1 rounded-xl border border-fg/10 p-4 hover:border-fg/25"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{counterpart}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusTone(b.status)}`}>
            {STATUS_LABEL[b.status]}
          </span>
        </div>
        <p className="mt-1 text-xs text-fg/55">
          {b.package?.name ?? b.package_snapshot?.name ?? "패키지"} · {fmtShootAt(b.shoot_at)}
        </p>
      </Link>
      {convId && (
        <Link
          href={`/chat/${convId}`}
          aria-label="채팅방으로 가기"
          title="채팅방으로 가기"
          className="grid w-12 shrink-0 place-items-center rounded-xl border border-fg/10 text-lg hover:border-fg/25 hover:bg-fg/[0.03]"
        >
          💬
        </Link>
      )}
    </li>
  );
}
