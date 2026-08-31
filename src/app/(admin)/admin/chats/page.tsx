import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge, EmptyState } from "@/components/ui";
import {
  CHAT_STATUSES,
  chatStatusLabel,
  chatStatusTone,
  deriveChatStatus,
  type ChatStatus,
} from "@/lib/chat";
import { ChatIcon } from "@/components/user/icons";

export const dynamic = "force-dynamic";

// 어드민 · 채팅 모니터링 — 모든 대화방을 최신 활동순으로.
// 운영 목적: 봇 수집 품질·작가 응답 속도·오프플랫폼 이탈 신호를 눈으로 확인.
type Row = {
  id: string;
  user_id: string;
  photographer_id: string;
  last_message_at: string | null;
  user_unread: number;
  photographer_unread: number;
  created_at?: string;
  bot_disabled_at: string | null;
  photographer: { display_name: string | null } | null;
  user: { display_name: string | null } | null;
  messages: { count: number }[];
};

function when(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes()
  ).padStart(2, "0")}`;
}

export default async function AdminChatsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const filter = CHAT_STATUSES.includes(sp.status as ChatStatus)
    ? (sp.status as ChatStatus)
    : null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("conversations")
    .select(
      "id, user_id, photographer_id, last_message_at, user_unread, photographer_unread, bot_disabled_at, " +
        "photographer:photographers(display_name), user:profiles!conversations_user_id_fkey(display_name), " +
        "messages(count)"
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);
  const allRooms = (data ?? []) as unknown as Row[];

  // 방 상태 — 예약이 있으면 예약이, 없으면 봇 인계 여부가 결정한다.
  // 목록의 방들만 한 번에 조회해 (고객:작가) 쌍으로 묶는다.
  const pairKeys = new Set(allRooms.map((r) => `${r.user_id}:${r.photographer_id}`));
  const { data: bks } = allRooms.length
    ? await admin
        .from("bookings")
        .select("user_id, photographer_id, status, transfer_marked_at, created_at")
        .order("created_at", { ascending: false })
    : { data: [] as { user_id: string; photographer_id: string; status: string; transfer_marked_at: string | null }[] };
  const LIVE = new Set(["requested", "accepted", "paid", "shot", "delivered", "completed"]);
  const bookingByPair = new Map<string, { status: string; transferMarkedAt: string | null }>();
  for (const b of bks ?? []) {
    const key = `${b.user_id}:${b.photographer_id}`;
    if (!pairKeys.has(key) || !LIVE.has(b.status as string) || bookingByPair.has(key)) continue;
    bookingByPair.set(key, {
      status: b.status as string,
      transferMarkedAt: (b.transfer_marked_at as string) ?? null,
    });
  }

  const withStatus = allRooms.map((r) => {
    const bk = bookingByPair.get(`${r.user_id}:${r.photographer_id}`);
    return {
      ...r,
      status: deriveChatStatus({
        botDisabledAt: r.bot_disabled_at,
        bookingStatus: bk?.status,
        transferMarkedAt: bk?.transferMarkedAt,
      }),
    };
  });

  const counts = CHAT_STATUSES.map((st) => ({
    status: st,
    n: withStatus.filter((r) => r.status === st).length,
  }));
  const rooms = filter ? withStatus.filter((r) => r.status === filter) : withStatus;

  // 방별 마지막 메시지 프리뷰 — 목록 방 한정 1쿼리로 가져와 그룹핑
  const ids = rooms.map((r) => r.id);
  const { data: lastMsgs } = ids.length
    ? await admin
        .from("messages")
        .select("conversation_id, type, body, created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(300)
    : { data: [] as { conversation_id: string; type: string; body: string }[] };
  const previewByRoom = new Map<string, { type: string; body: string }>();
  for (const m of lastMsgs ?? []) {
    if (!previewByRoom.has(m.conversation_id as string))
      previewByRoom.set(m.conversation_id as string, { type: m.type as string, body: m.body as string });
  }

  const previewText = (p?: { type: string; body: string }) => {
    if (!p) return "메시지 없음 (봇 문의 시작 단계)";
    if (p.type === "summary_card") return "📋 문의 요약 카드";
    if (p.type === "image") return "🖼 사진";
    return p.body.slice(0, 60);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-5">
      <h1 className="text-h1 font-semibold">채팅 모니터링</h1>
      <p className="mt-1 text-body-sm text-muted">
        {filter ? `${chatStatusLabel(filter, "admin")} ${rooms.length}개` : `모든 대화방 ${rooms.length}개`}{" "}
        · 최신 활동순 (최근 100개)
      </p>

      {/* 상태별로 골라 본다 — 운영이 손대야 하는 건 '챗봇 상담중' 이 오래 머무는 방이다 */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Link
          href="/admin/chats"
          className={`rounded-full px-3 py-1.5 text-caption font-medium transition-colors ${
            filter ? "bg-fg/[0.06] text-muted hover:bg-fg/10" : "bg-fg text-bg"
          }`}
        >
          전체 {withStatus.length}
        </Link>
        {counts.map((c) => (
          <Link
            key={c.status}
            href={`/admin/chats?status=${c.status}`}
            className={`rounded-full px-3 py-1.5 text-caption font-medium transition-colors ${
              filter === c.status ? "bg-fg text-bg" : "bg-fg/[0.06] text-muted hover:bg-fg/10"
            }`}
          >
            {chatStatusLabel(c.status, "admin")} {c.n}
          </Link>
        ))}
      </div>

      {rooms.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<ChatIcon className="h-7 w-7" />}
          title="대화가 없어요"
          description="고객이 챗봇 문의를 시작하면 여기에 표시돼요."
        />
      ) : (
        <ul className="mt-5 divide-y divide-line rounded-2xl bg-surface ring-1 ring-line">
          {rooms.map((r) => {
            const preview = previewByRoom.get(r.id);
            const msgCount = r.messages?.[0]?.count ?? 0;
            return (
              <li key={r.id}>
                <Link
                  href={`/admin/chats/${r.id}`}
                  className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-fg/[0.02]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-body-sm font-semibold text-fg">
                      <span className="min-w-0 truncate">
                        {r.user?.display_name ?? "고객"} → {r.photographer?.display_name ?? "작가"}
                      </span>
                      <Badge tone={chatStatusTone(r.status)} className="shrink-0">
                        {chatStatusLabel(r.status, "admin")}
                      </Badge>
                    </p>
                    <p className="mt-0.5 truncate text-caption text-muted">{previewText(preview)}</p>
                  </div>
                  <div className="shrink-0 text-right text-caption text-faint">
                    <p>{when(r.last_message_at)}</p>
                    <p className="mt-0.5">
                      {msgCount}개
                      {r.photographer_unread > 0 && (
                        <span className="ml-1.5 rounded bg-danger-soft px-1 py-0.5 font-semibold text-danger">
                          작가 미확인 {r.photographer_unread}
                        </span>
                      )}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
