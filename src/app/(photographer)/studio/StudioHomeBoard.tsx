import Link from "next/link";
import { Badge } from "@/components/ui";
import { bookingStatusLabel, type BookingStatus } from "@/lib/booking-status";

// 작가 스튜디오 홈 — "지금 뭘 해야 하나" 를 위에서부터 답한다.
//
// 이전 화면은 리드 모델(작가가 문의를 돈 내고 여는)의 잔재였다. 에스크로로 바뀐 뒤로는
// 그 카운터가 언제나 0 이라, 예약이 실제로 들어와도 작가는 홈에서 아무것도 못 봤다.
// 지금은 예약(bookings)과 안읽음이 진실이므로 그것만 보여준다.
//
// 순서가 곧 우선순위다: 내가 움직여야 하는 것 → 기다리는 것 → 다가오는 촬영.

const fmt = new Intl.NumberFormat("ko-KR");

export type StudioBooking = {
  id: string;
  status: string;
  shootAt: string | null;
  shootDate: string | null;
  amountKrw: number;
  transferMarkedAt: string | null;
  customerName: string | null;
  packageName: string | null;
  conversationId: string | null;
};

const when = (b: StudioBooking) =>
  b.shootAt
    ? new Intl.DateTimeFormat("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Seoul",
      }).format(new Date(b.shootAt))
    : b.shootDate ?? "일시 협의 중";

export function StudioHomeBoard({
  unreadRooms,
  unreadTotal,
  toAccept,
  awaitingDeposit,
  upcoming,
}: {
  /** 안읽은 메시지가 있는 방 수 */
  unreadRooms: number;
  unreadTotal: number;
  /** 고객이 제안해 내가 수락해야 하는 예약 */
  toAccept: StudioBooking[];
  /** 수락은 됐고 고객 입금을 기다리는 예약 */
  awaitingDeposit: StudioBooking[];
  /** 입금까지 끝나 촬영만 남은 예약 */
  upcoming: StudioBooking[];
}) {
  const nothingToDo =
    unreadTotal === 0 && toAccept.length === 0 && awaitingDeposit.length === 0 && upcoming.length === 0;

  return (
    <div className="space-y-7">
      {nothingToDo && (
        <p className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-body-sm text-muted">
          지금 처리할 일이 없어요. 새 문의가 오면 여기에 표시됩니다.
        </p>
      )}

      {/* ① 답장 — 가장 급하다. 답이 늦으면 고객은 다른 작가에게 간다 */}
      {unreadTotal > 0 && (
        <Link
          href="/studio/chat"
          className="flex items-center gap-3 rounded-2xl border border-brand/25 bg-brand/[0.06] p-4 transition-colors hover:bg-brand/[0.1]"
        >
          <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-full bg-brand px-2 text-body-sm font-bold text-white">
            {unreadTotal > 99 ? "99+" : unreadTotal}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-body-sm font-semibold text-fg">답장을 기다리는 대화</span>
            <span className="mt-0.5 block text-caption text-muted">
              {unreadRooms}개 방에 안 읽은 메시지가 있어요
            </span>
          </span>
          <span className="shrink-0 text-caption text-muted">채팅 →</span>
        </Link>
      )}

      {/* ② 수락 대기 — 고객이 제안한 예약. 내가 눌러야 다음으로 간다 */}
      <Section title="수락 대기" count={toAccept.length} empty="고객이 보낸 예약 제안이 없어요.">
        {toAccept.map((b) => (
          <Row key={b.id} b={b} action="확인하고 수락하기" />
        ))}
      </Section>

      {/* ③ 입금 대기 — 내가 할 일은 없다. 오래 멈춰 있으면 한 번 물어보라는 뜻 */}
      <Section
        title="고객 입금 대기"
        count={awaitingDeposit.length}
        empty="입금을 기다리는 예약이 없어요."
        hint="수락은 됐고 고객 입금을 기다리는 중이에요. 사매가 확인하면 정산해드려요."
      >
        {awaitingDeposit.map((b) => (
          <Row key={b.id} b={b} />
        ))}
      </Section>

      {/* ④ 촬영 예정 — 다가오는 순 */}
      <Section title="촬영 예정" count={upcoming.length} empty="예정된 촬영이 없어요.">
        {upcoming.map((b) => (
          <Row key={b.id} b={b} />
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  count,
  empty,
  hint,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-body-sm font-semibold text-fg">
        {title}
        <Badge tone={count > 0 ? "brand" : "neutral"}>{count}</Badge>
      </h2>
      {hint && count > 0 && <p className="mt-1 text-caption text-muted">{hint}</p>}
      {count === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-line px-4 py-5 text-center text-caption text-faint">
          {empty}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">{children}</ul>
      )}
    </section>
  );
}

function Row({ b, action }: { b: StudioBooking; action?: string }) {
  const href = b.conversationId ? `/chat/${b.conversationId}` : `/bookings/${b.id}`;
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-body-sm font-semibold text-fg">
              {b.customerName ?? "고객"}
            </span>
            <Badge tone="neutral">
              {bookingStatusLabel(
                { status: b.status as BookingStatus, transfer_marked_at: b.transferMarkedAt },
                false // 작가 시점
              )}
            </Badge>
          </span>
          <span className="mt-0.5 block truncate text-caption text-muted">
            {b.packageName ? `${b.packageName} · ` : ""}
            {when(b)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-body-sm font-semibold text-fg">₩{fmt.format(b.amountKrw)}</span>
          {action && <span className="mt-0.5 block text-caption text-brand">{action}</span>}
        </span>
      </Link>
    </li>
  );
}
