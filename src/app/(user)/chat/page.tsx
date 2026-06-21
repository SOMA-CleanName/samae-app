import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  listChatRooms,
  counterpartName,
  counterpartAvatar,
  myUnread,
  CHAT_STATUS_LABEL,
  type ChatStatus,
  type ChatRoomItem,
} from "@/lib/chat";
import type { CurrentUser } from "@/lib/auth";
import { Avatar, Badge, EmptyState } from "@/components/ui";
import { ChatIcon } from "@/components/user/icons";
import { LeaveButton } from "./LeaveButton";

export const dynamic = "force-dynamic";

// 마지막 메시지 시각 — 오늘은 시:분, 그 외는 월/일
function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return new Intl.DateTimeFormat("ko-KR", {
    ...(sameDay
      ? { hour: "2-digit", minute: "2-digit" }
      : { month: "numeric", day: "numeric" }),
    timeZone: "Asia/Seoul",
  }).format(d);
}

// 상태 → Badge 톤 (consulting=상담 중 / booked=예약 / shot=촬영 완료)
function statusTone(s: ChatStatus): "neutral" | "warning" | "success" {
  if (s === "shot") return "success";
  if (s === "booked") return "warning";
  return "neutral";
}

// 채팅 목록 — 실제 대화가 오간 방만, 진행 상태·나가기 포함
export default async function ChatListPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/chat");

  const rooms = await listChatRooms(me);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 font-kr sm:px-6">
      <h1 className="text-h1 font-semibold">채팅</h1>

      {rooms.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<ChatIcon className="h-7 w-7" />}
          title="아직 대화가 없어요"
          description="작가 프로필에서 채팅을 시작하면 여기에 표시돼요."
        />
      ) : (
        <ul className="mt-5 divide-y divide-line">
          {rooms.map((c) => (
            <ChatRoomRow key={c.id} room={c} me={me} withLeave />
          ))}
        </ul>
      )}
    </main>
  );
}

// 채팅 목록 한 줄 — 아바타 + 이름·상태 + 시각·안읽음. 사용자/스튜디오 공용 패턴.
export function ChatRoomRow({
  room: c,
  me,
  withLeave,
}: {
  room: ChatRoomItem;
  me: CurrentUser;
  withLeave?: boolean;
}) {
  const unread = myUnread(c, me);
  const name = counterpartName(c, me);
  return (
    <li className="flex items-center">
      <Link
        href={`/chat/${c.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-3 pr-1 transition-colors hover:bg-fg/[0.03]"
      >
        <Avatar src={counterpartAvatar(c, me)} name={name} size="md" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-body font-semibold text-fg">{name}</span>
            <Badge tone={statusTone(c.status)} className="shrink-0">
              {CHAT_STATUS_LABEL[c.status]}
            </Badge>
          </span>
          <span className="mt-0.5 block text-caption text-faint">{when(c.last_message_at)}</span>
        </span>
        {unread > 0 && (
          <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1.5 text-label font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
      {withLeave && <LeaveButton conversationId={c.id} />}
    </li>
  );
}
