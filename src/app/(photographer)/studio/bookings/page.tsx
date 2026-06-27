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

// 상태 그룹 (받은 제안은 별도 상단 섹션으로)
const GROUPS: { label: string; statuses: BookingStatus[] }[] = [
  { label: "진행 중", statuses: ["accepted", "paid", "shot", "delivered"] },
  { label: "완료", statuses: ["completed"] },
  { label: "환불", statuses: ["refunded"] },
];

// 스튜디오 예약 — 작가가 받은/진행 중 예약 (스튜디오 크롬 유지). 상세는 /bookings/[id] 공유.
export default async function StudioBookingsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/bookings");
  if (!me.photographer) redirect("/studio");
  const phId = me.photographer.id;

  const [all, convMap] = await Promise.all([listMyBookings(), getConversationMap()]);
  const mine = all.filter((b) => b.photographer_id === phId);

  // 받은 제안(고객이 보냄 → 내가 수락) / 내가 보낸 제안(고객 수락 대기)
  const received = mine.filter((b) => b.status === "requested" && !b.proposed_by_photographer);
  const myPending = mine.filter((b) => b.status === "requested" && b.proposed_by_photographer);

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8 font-kr">
      <h1 className="text-2xl font-semibold">예약</h1>
      <p className="mt-1 text-sm text-fg/50">받은 제안과 진행 중인 촬영을 한눈에 관리하세요.</p>

      {/* 받은 제안 — 수락 대기 (액션 필요) */}
      {received.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-warning">받은 예약 제안 · {received.length}</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {received.map((b) => (
              <BookingItem key={b.id} b={b} convMap={convMap} highlight />
            ))}
          </ul>
        </section>
      )}

      {/* 상태별 진행/완료/환불 */}
      {GROUPS.map((group) => {
        const rows = mine.filter((b) => group.statuses.includes(b.status));
        if (rows.length === 0) return null;
        return (
          <section key={group.label} className="mt-7">
            <h2 className="text-sm font-medium text-fg/70">
              {group.label} <span className="text-fg/40">{rows.length}</span>
            </h2>
            <ul className="mt-2 flex flex-col gap-2">
              {rows.map((b) => (
                <BookingItem key={b.id} b={b} convMap={convMap} />
              ))}
            </ul>
          </section>
        );
      })}

      {/* 내가 보낸 제안 대기 */}
      {myPending.length > 0 && (
        <p className="mt-7 text-xs text-fg/45">
          내가 보낸 제안 {myPending.length}건이 고객 수락을 기다리고 있어요.
        </p>
      )}

      {mine.length === 0 && (
        <p className="mt-10 text-center text-sm text-fg/45">아직 예약이 없어요.</p>
      )}
    </main>
  );
}

// 예약 행 — 상세(/bookings/[id]) + 채팅 바로가기(💬 /chat/[id])
function BookingItem({
  b,
  convMap,
  highlight,
}: {
  b: BookingRow;
  convMap: Map<string, string>;
  highlight?: boolean;
}) {
  const convId = convMap.get(`${b.user_id}:${b.photographer_id}`);
  return (
    <li className="flex items-stretch gap-2">
      <Link
        href={`/bookings/${b.id}`}
        className={`block flex-1 rounded-xl border p-4 transition-colors ${
          highlight ? "border-warning/30 bg-warning/[0.06] hover:bg-warning/[0.1]" : "border-fg/10 hover:border-fg/25"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{b.user?.display_name || "고객"}</span>
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
