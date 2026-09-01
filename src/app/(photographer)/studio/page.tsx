import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchUnreadTotalForPhotographer, listChatRooms } from "@/lib/chat";
import { StudioHomeBoard, type StudioBooking } from "./StudioHomeBoard";

export const dynamic = "force-dynamic";

// 작가 스튜디오 홈 — 신청 상태별 분기. 승인 작가는 문의 허브(리드 모델).
export default async function StudioHome() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio");

  const ph = me.photographer;

  // 미신청/대기/반려/정지 — 상태 카드만 (레이아웃이 사이드바를 안 씌움)
  if (!ph || ph.status !== "approved") {
    return (
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 font-kr">
        <Link href="/" className="text-sm text-fg/50 hover:text-fg">
          ← 홈으로
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">작가 스튜디오</h1>

        {!ph && (
          <div className="mt-6 rounded-xl border border-fg/10 p-6">
            <p className="text-sm text-fg/70">
              아직 작가로 등록되지 않았어요. 신청하고 승인받으면 사진이 홈 피드에 노출됩니다.
            </p>
            <Link
              href="/apply"
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

  // ── 승인 작가 — 오늘 할 일 보드 ────────────────────────────────
  const board = await loadBoard(ph.id, me);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 font-kr sm:px-6">
      <h1 className="text-2xl font-semibold">스튜디오</h1>
      <p className="mt-1 text-sm text-fg/50">
        <b className="text-fg/70">{ph.displayName}</b> 작가님, 오늘 할 일이에요.
      </p>

      <div className="mt-6">
        <StudioHomeBoard {...board} />
      </div>
    </main>
  );
}

/**
 * 홈에 필요한 것만 모아 온다 — 예약과 안읽음.
 *
 * 예약은 RLS 로 작가 본인 것만 보이지만, 고객 이름은 profiles RLS 에 막혀 비어 온다.
 * 이미 '내 예약' 임이 확인된 건에 한해 admin 으로 이름만 보강한다(연락처는 건드리지 않는다).
 */
async function loadBoard(photographerId: string, me: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  const admin = createAdminClient();

  const [{ data: rows }, unreadTotal, rooms] = await Promise.all([
    admin
      .from("bookings")
      .select(
        "id, status, shoot_at, shoot_date, amount_krw, transfer_marked_at, package_snapshot, user_id, proposed_by_photographer, created_at"
      )
      .eq("photographer_id", photographerId)
      .in("status", ["requested", "accepted", "paid", "shot"])
      .order("created_at", { ascending: false }),
    fetchUnreadTotalForPhotographer(photographerId),
    listChatRooms(me),
  ]);

  type Row = {
    id: string;
    status: string;
    shoot_at: string | null;
    shoot_date: string | null;
    amount_krw: number | null;
    transfer_marked_at: string | null;
    package_snapshot: { name?: string } | null;
    user_id: string;
    proposed_by_photographer: boolean;
  };
  const bookings = (rows ?? []) as Row[];

  const nameById = new Map<string, string | null>();
  const convByBooking = new Map<string, string>();
  if (bookings.length > 0) {
    const [{ data: profiles }, { data: msgs }] = await Promise.all([
      admin
        .from("profiles")
        .select("id, display_name")
        .in("id", [...new Set(bookings.map((b) => b.user_id))]),
      admin
        .from("messages")
        .select("booking_id, conversation_id")
        .in("booking_id", bookings.map((b) => b.id)),
    ]);
    for (const p of (profiles ?? []) as { id: string; display_name: string | null }[])
      nameById.set(p.id, p.display_name);
    for (const m of (msgs ?? []) as { booking_id: string | null; conversation_id: string }[])
      if (m.booking_id && !convByBooking.has(m.booking_id))
        convByBooking.set(m.booking_id, m.conversation_id);
  }

  const toItem = (b: Row): StudioBooking => ({
    id: b.id,
    status: b.status,
    shootAt: b.shoot_at,
    shootDate: b.shoot_date,
    amountKrw: b.amount_krw ?? 0,
    transferMarkedAt: b.transfer_marked_at,
    customerName: nameById.get(b.user_id) ?? null,
    packageName: b.package_snapshot?.name ?? null,
    conversationId: convByBooking.get(b.id) ?? null,
  });

  // 촬영 예정은 다가오는 순 — 오래된 순으로 쌓아두면 정작 내일 촬영이 아래에 묻힌다
  const byShoot = (a: StudioBooking, c: StudioBooking) =>
    (a.shootAt ?? a.shootDate ?? "").localeCompare(c.shootAt ?? c.shootDate ?? "");

  return {
    unreadTotal,
    unreadRooms: rooms.filter((r) => r.photographer_unread > 0).length,
    // 내가 수락해야 하는 건 = 고객이 제안한 requested
    toAccept: bookings.filter((b) => b.status === "requested" && !b.proposed_by_photographer).map(toItem),
    awaitingDeposit: bookings
      .filter((b) => b.status === "accepted" && !b.transfer_marked_at)
      .map(toItem),
    upcoming: bookings
      .filter((b) => b.status === "paid" || b.status === "shot" || (b.status === "accepted" && b.transfer_marked_at))
      .map(toItem)
      .sort(byShoot),
  };
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
    tone === "wait" ? "border-warning/20 bg-warning/[0.06]" : "border-brand/20 bg-brand/[0.06]";
  return (
    <div className={`mt-6 rounded-xl border p-6 ${color}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-fg/65">{desc}</p>
      <p className="mt-3 text-xs text-fg/45">작가명: {displayName}</p>
    </div>
  );
}