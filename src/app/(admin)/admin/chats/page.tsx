import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui";
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

export default async function AdminChatsPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("conversations")
    .select(
      "id, user_id, photographer_id, last_message_at, user_unread, photographer_unread, " +
        "photographer:photographers(display_name), user:profiles!conversations_user_id_fkey(display_name), " +
        "messages(count)"
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);
  const rooms = (data ?? []) as unknown as Row[];

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
        모든 대화방 {rooms.length}개 · 최신 활동순 (최근 100개)
      </p>

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
                    <p className="text-body-sm font-semibold text-fg">
                      {r.user?.display_name ?? "고객"} → {r.photographer?.display_name ?? "작가"}
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
