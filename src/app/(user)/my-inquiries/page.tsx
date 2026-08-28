import type { Metadata } from "next";
import Link from "next/link";
import { readMyInquiryIds, fetchMyInquiries } from "@/lib/my-inquiries";
import { listChatRooms, type ChatRoomItem } from "@/lib/chat";
import { getCurrentUser } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { ClipboardIcon } from "@/components/user/icons";
import { MyInquiryList } from "./MyInquiryList";
import { RealtimeListRefresh } from "@/components/user/RealtimeListRefresh";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookingStatusLabel, type BookingStatus } from "@/lib/booking-status";
import { readStoredFieldValues } from "@/lib/booking-fields";
import type { InquiryBooking } from "./MyInquiryList";

type DbInquiryBooking = {
  id: string;
  photographer_id: string;
  status: string;
  transfer_marked_at: string | null;
  shoot_at: string | null;
  shoot_date: string | null;
  location_text: string | null;
  memo: string | null;
  amount_krw: number | null;
  travel_fee_krw: number | null;
  custom_fields: unknown;
  package_snapshot: { name?: string } | null;
};

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "문의", robots: { index: false } };

// '문의' 탭 = 대화 허브 — 채팅 페이지 병합:
//   상단: 대화방 목록(작가 답장·봇 승격 대화가 있는 방) → /chat/[id]
//   하단: 문의 내역 카드 — 방이 있으면 그 방으로, 없으면 챗봇 방으로 재진입
export default async function MyInquiriesPage() {
  const [ids, me] = await Promise.all([readMyInquiryIds(), getCurrentUser()]);
  const [inquiries, allRooms] = await Promise.all([
    fetchMyInquiries(ids, me?.id),
    me ? listChatRooms(me) : Promise.resolve([] as ChatRoomItem[]),
  ]);
  // 문의 탭은 "내가 고객인 방"만 — 작가로 받은 문의는 스튜디오 채팅에서 (역할 분리)
  const rooms = me ? allRooms.filter((r) => r.user_id === me.id) : [];
  // 작가별 대화방 매핑 — 문의 카드의 '채팅방 열기'를 실제 방으로 연결
  const roomByPhotographer = new Map(rooms.map((r) => [r.photographer_id, r.id]));
  // 접수 완료된 작가 — 이 작가의 방은 일반 채팅으로, 미접수(봇 수집 중)면 봇으로 복귀.
  // (봇 대화가 DB에 실시간 동기화되면서 last_message_at 만으로는 진행 중을 구분 못 한다)
  const submittedPhotographers = new Set(inquiries.map((i) => i.photographerId));

  // 진행 중인 예약 — 문의 카드에서 예약 내용까지 다 보이게 한다.
  //
  // 문의 탭은 "내가 어디까지 갔나" 를 보는 자리다. 그런데 예약이 잡히고 나면 정작 그
  // 결과(일시·장소·금액)는 채팅방 안에만 있어서, 확인하려면 대화를 거슬러 올라가야 했다.
  const bookingByPhotographer: Record<string, InquiryBooking> = {};
  if (me) {
    const admin = createAdminClient();
    const { data: bks } = await admin
      .from("bookings")
      .select(
        "id, photographer_id, status, transfer_marked_at, shoot_at, shoot_date, location_text, memo, amount_krw, travel_fee_krw, custom_fields, package_snapshot, created_at"
      )
      .eq("user_id", me.id)
      .in("status", ["requested", "accepted", "paid", "shot", "delivered", "completed"])
      .order("created_at", { ascending: false });

    for (const b of (bks ?? []) as DbInquiryBooking[]) {
      // 작가당 가장 최근 1건만 — 카드는 문의 단위라 여러 건을 쌓으면 무엇을 보는지 흐려진다
      if (bookingByPhotographer[b.photographer_id]) continue;
      bookingByPhotographer[b.photographer_id] = {
        id: b.id,
        status: b.status,
        statusLabel: bookingStatusLabel(
          { status: b.status as BookingStatus, transfer_marked_at: b.transfer_marked_at },
          true // 문의 탭은 언제나 고객 시점
        ),
        // 입금을 알린 뒤부터가 사매를 거쳐야 하는 구간 (그 전엔 채팅에서 그냥 취소하면 된다)
        settled: b.status !== "requested" && (b.status !== "accepted" || !!b.transfer_marked_at),
        packageName: b.package_snapshot?.name ?? null,
        when: b.shoot_at
          ? new Intl.DateTimeFormat("ko-KR", {
              month: "long",
              day: "numeric",
              weekday: "short",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Seoul",
            }).format(new Date(b.shoot_at))
          : b.shoot_date ?? "날짜 협의 중",
        location: b.location_text,
        memo: b.memo || null,
        amountKrw: b.amount_krw ?? 0,
        travelFeeKrw: b.travel_fee_krw ?? 0,
        customFields: readStoredFieldValues(b.custom_fields),
      };
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 font-kr">
      {/* 새 메시지·안읽음 변화 실시간 반영 (목록 리렌더) */}
      {me && <RealtimeListRefresh />}
      <h1 className="text-h1 font-semibold">문의</h1>
      <p className="mt-1 text-body-sm text-muted">작가와의 대화와 문의 진행 상태를 확인할 수 있어요.</p>

      {rooms.length > 0 && (
        <section className="mt-5">
          <ul className="space-y-2">
            {rooms.map((r) => {
              // 채팅방 상주 봇 — 작성 중이든 접수 후든 방은 하나. 라벨만 진행 상태를 구분한다.
              const startedWithBot = r.bot_photo_id != null || r.bot_slots != null;
              const inProgress = startedWithBot && !submittedPhotographers.has(r.photographer_id);
              const href = `/chat/${r.id}`;
              return (
              <li key={r.id}>
                <Link
                  href={href}
                  className="flex items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-sm ring-1 ring-line transition-colors hover:bg-fg/[0.02]"
                >
                  {r.photographer_avatar_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={r.photographer_avatar_url}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-fg/[0.06] text-body font-semibold text-muted">
                      {(r.photographer?.display_name ?? "작").slice(0, 1)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-semibold text-fg">
                      {r.photographer?.display_name ?? "작가"}
                    </p>
                    <p className="mt-0.5 text-caption text-muted">
                      {inProgress ? "문의 작성 중 — 이어서 진행하기" : "대화 진행 중"}
                    </p>
                  </div>
                  {r.user_unread > 0 && (
                    <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1.5 text-label font-bold text-white">
                      {r.user_unread}
                    </span>
                  )}
                </Link>
              </li>
              );
            })}
          </ul>
        </section>
      )}

      {inquiries.length === 0 && rooms.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<ClipboardIcon className="h-7 w-7" />}
            title="아직 문의 내역이 없어요"
            description="마음에 든 작가에게 문의하면 여기에 쌓여요."
          />
        </div>
      ) : inquiries.length > 0 ? (
        <>
          <h2 className="mt-7 text-body font-semibold text-muted">문의 내역</h2>
          <MyInquiryList
            inquiries={inquiries}
            roomByPhotographer={Object.fromEntries(roomByPhotographer)}
            bookingByPhotographer={bookingByPhotographer}
          />
        </>
      ) : null}
    </main>
  );
}
