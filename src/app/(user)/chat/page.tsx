import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listChatRooms, counterpartName, myUnread, CHAT_STATUS_LABEL, type ChatStatus } from "@/lib/chat";
import { LeaveButton } from "./LeaveButton";

export const dynamic = "force-dynamic";

function when(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

// 상태 배지 색조
function statusTone(s: ChatStatus): string {
  if (s === "shot") return "bg-emerald-500/15 text-emerald-700";
  if (s === "booked") return "bg-amber-500/15 text-amber-700";
  return "bg-fg/10 text-fg/55";
}

// 채팅 목록 — 실제 대화가 오간 방만, 진행 상태·나가기 포함
export default async function ChatListPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/chat");

  const rooms = await listChatRooms(me);

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8 font-kr">
      <h1 className="text-2xl font-semibold">채팅</h1>
      {rooms.length === 0 ? (
        <p className="mt-10 text-center text-sm text-fg/45">
          아직 대화가 없어요. 작가 프로필에서 채팅을 시작해보세요.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-fg/8">
          {rooms.map((c) => {
            const unread = myUnread(c, me);
            return (
              <li key={c.id} className="flex items-center gap-2">
                <Link
                  href={`/chat/${c.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5 py-3 hover:bg-fg/[0.02]"
                >
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(c.status)}`}>
                    {CHAT_STATUS_LABEL[c.status]}
                  </span>
                  <span className="truncate font-medium">{counterpartName(c, me)}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-fg/45">
                    {when(c.last_message_at)}
                    {unread > 0 && (
                      <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {unread}
                      </span>
                    )}
                  </span>
                </Link>
                <LeaveButton conversationId={c.id} />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
