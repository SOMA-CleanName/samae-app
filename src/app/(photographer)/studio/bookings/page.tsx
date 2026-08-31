import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  listMyBookings,
  getConversationMap,
  bookingStatusLabel,
  statusTone,
  fmtShootAt,
  type BookingRow,
  type BookingStatus,
} from "@/lib/bookings";
import { acceptBooking, rejectBooking } from "@/app/actions/bookings";

const fmt = new Intl.NumberFormat("ko-KR");

// 지금 무엇을 기다리는 중인지 — 작가가 목록에서 바로 판단할 수 있게 한 줄로.
// 에스크로: 입금 확인 주체는 사매(운영자)이므로 작가가 할 일과 기다릴 일을 구분해 적는다.
function waitingLabel(b: BookingRow): string | null {
  switch (b.status) {
    case "requested":
      return b.proposed_by_photographer ? "고객 수락 대기 중" : "내 수락 대기 — 아래에서 바로 응답하세요";
    case "accepted":
      return b.transfer_marked_at
        ? "고객이 입금 완료를 알렸어요 — 사매가 확인 중"
        : "고객 입금 대기 중 (사매 계좌)";
    case "paid":
      return "입금 확인됨 — 촬영 후 보정본을 전달해주세요";
    case "shot":
      return "보정본 전달 대기";
    case "delivered":
      return "고객의 전달 확인 대기";
    case "completed":
      return "거래 완료 — 정산은 정산 탭에서 확인하세요";
    default:
      return null;
  }
}

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
              <BookingItem key={b.id} b={b} convMap={convMap} highlight actionable />
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
// actionable: 받은 제안은 목록에서 바로 수락/거절한다 (상세·채팅까지 들어갈 필요 없음).
function BookingItem({
  b,
  convMap,
  highlight,
  actionable,
}: {
  b: BookingRow;
  convMap: Map<string, string>;
  highlight?: boolean;
  actionable?: boolean;
}) {
  const convId = convMap.get(`${b.user_id}:${b.photographer_id}`);
  const waiting = waitingLabel(b);
  return (
    <li
      className={`rounded-xl border transition-colors ${
        highlight ? "border-warning/30 bg-warning/[0.06]" : "border-fg/10"
      }`}
    >
      <div className="flex items-stretch gap-2">
        <Link href={`/bookings/${b.id}`} className="block flex-1 rounded-xl p-4 hover:bg-fg/[0.03]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{b.user?.display_name || "고객"}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusTone(b.status)}`}>
              {bookingStatusLabel(b, false)}
            </span>
          </div>
          <p className="mt-1 text-xs text-fg/55">
            {b.package?.name ?? b.package_snapshot?.name ?? "패키지"} · {fmtShootAt(b.shoot_at, b.shoot_date)}
          </p>
          <p className="mt-1 text-xs text-fg/70">
            ₩{fmt.format(b.amount_krw ?? 0)}
            {waiting && <span className="ml-2 font-normal text-fg/45">{waiting}</span>}
          </p>
        </Link>
        {convId && (
          <Link
            href={`/chat/${convId}`}
            aria-label="채팅방으로 가기"
            title="채팅방으로 가기"
            className="my-2 mr-2 grid w-12 shrink-0 place-items-center rounded-xl border border-fg/10 text-lg hover:border-fg/25 hover:bg-fg/[0.03]"
          >
            💬
          </Link>
        )}
      </div>

      {/* 수락/거절 — 권한은 서버가 다시 검증한다(제안자의 상대만 가능) */}
      {actionable && (
        <div className="flex gap-2 border-t border-fg/10 p-3">
          <form action={acceptBooking} className="flex-1">
            <input type="hidden" name="id" value={b.id} />
            <button className="w-full rounded-xl bg-fg py-2.5 text-sm font-semibold text-bg hover:opacity-90">
              수락
            </button>
          </form>
          <form action={rejectBooking} className="flex-1">
            <input type="hidden" name="id" value={b.id} />
            <button className="w-full rounded-xl border border-fg/20 py-2.5 text-sm text-fg/70 hover:bg-fg/[0.04]">
              거절
            </button>
          </form>
        </div>
      )}
    </li>
  );
}
